const { User, Game, GameMember, GameSet, GameVote } = require('../../models');
const db = require('../../models');
const { getVoteList, calculateVoteResult, } = require('./getVoteResult');
const {printErrorLog} = require('../../util/log');
const { gameSchema } = require('../../util/joi/schema');
const pm2 = require('pm2');

const processId = 0;

const vote = async (req, res, next) => {
    try {
        const { error, value } = gameSchema.vote.validate(req.body);
        const { game_set_idx, user_idx } = value;
        if(error){
            res.status(400).json({
                error: error.details[0].message
            });
            return;
        }

        const io = req.app.get('io');
    
        const gameVoteList = await getVoteList(game_set_idx);

        if (!gameVoteList || gameVoteList.length == 0) { // first vote
            if (!timerResolveMap.get(game_set_idx)) {
                // 특정 process에게 start vote하라고 메시지 전송
                pm2.sendDataToProcessId(
                    processId,
                    {
                        type: 'process:msg', 
                        data: { 
                            gameSetIdx: game_set_idx, 
                            time: 15, 
                            afterFunctionParameterList: [
                                res.locals.gameIdx,
                                game_set_idx,
                                io,
                            ]
                        },
                        topic: "start vote"
                    },
                    (err, result) => {
                        if (err) {
                            console.log('[error]', err);
                        }
                    }
                );
            }
            await voteByCreating(game_set_idx, user_idx);
        } else { // not first vote
            let voteRecipientsIdx = undefined;
            for (const vote of gameVoteList) {
                if (user_idx == vote['game_member_game_member_idx_GameMember.wrm_user_idx']) {
                    voteRecipientsIdx = vote['game_member_game_member_idx_GameMember.game_member_idx'];
                    break;
                }
            }

            if (!voteRecipientsIdx) {
                await voteByCreating(game_set_idx, user_idx);
            } else {
                await voteByUpdating(voteRecipientsIdx, game_set_idx);
            }
        }
        
        // 투표 수 update
        // 특정 process에게 해당 투표의 투표자 수 업데이트하라고 메시지 전송
        pm2.sendDataToProcessId(
            processId,
            {
                type: 'process:msg', 
                data: { 
                    gameSetIdx: game_set_idx, 
                },
                topic: "update vote"
            },
            (err, result) => {
                if (err) {
                    console.log('[error]', err);
                }
            }
        );
        res.status(201).json({});
        
        // 투표 수 count
        // 특정 process에게 투표 수 count 후 조건 만족 시 투표 종료하라고 메시지 전송
        pm2.sendDataToProcessId(
            processId,
            {
                type: 'process:msg', 
                data: { 
                    gameIdx : res.locals.gameIdx,
                    gameSetIdx: game_set_idx, 
                },
                topic: "check to finish vote"
            },
            (err, result) => {
                if (err) {
                    console.log('[error]', err);
                }
            }
        );
    } catch (error) {
        printErrorLog('vote', error);
        res.status(400).json({
            meesage: '알 수 없는 에러가 발생했습니다.',
            error: error.message,
        });
    }
};

// timer
const timerResolveMap = new Map(); // key: gameSetIdx
const numberOfRequeststMap = new Map(); // key: gameSetIdx
const timer = async (mapKey, time, afterFunction, functionParameterList) => {
    try {
        numberOfRequeststMap.set(mapKey, 0);

        let timerId;
        let promise = new Promise((resolve, reject) => {
            timerId = setTimeout(() => resolve('time out'), time * 1000);
            timerResolveMap.set(mapKey, resolve);
        });

        let result = await promise;
        clearTimeout(timerId);
        timerResolveMap.delete(mapKey);
        numberOfRequeststMap.delete(mapKey);

        afterFunction(...functionParameterList);
        return result;
    } catch (error) {
        printErrorLog('vote-timer', error);
    }
};
const checkNumberOfVoters = async (gameIdx, gameSetIdx) => {
    const memberCount = await GameMember.findAll({
        where: { game_game_idx: gameIdx },
    });
    if (numberOfRequeststMap.get(gameSetIdx) == memberCount.length) {
        const timerResolve = timerResolveMap.get(gameSetIdx);
        timerResolve('success');
    }
};

// vote
const voteByCreating = async (gameSetIdx, userIdx) => {
    let voteRecipients = await GameMember.findOne({
        where: {
            wrm_user_idx: userIdx,
        },
    });

    await GameVote.create({
        game_vote_cnt: 1,
        game_set_game_set_idx: gameSetIdx,
        game_member_game_member_idx: voteRecipients.get('game_member_idx'),
    });
};
const voteByUpdating = async (voteRecipientsIdx, gameSetIdx) => {
    const updateGameVoteQuery = `UPDATE GameVote SET game_vote_cnt = game_vote_cnt + 1 WHERE game_member_game_member_idx=${voteRecipientsIdx} and game_set_game_set_idx=${gameSetIdx}`;
    await db.sequelize.query(updateGameVoteQuery, {
        type: db.sequelize.QueryTypes.UPDATE,
    });
};

// vote result
const finishVote = async (gameIdx, gameSetIdx, io) => {
    const { game, topVoteRankList, score } = await calculateVoteResult(
        gameIdx,
        gameSetIdx,
        2
    );
        
    if (score) {
        addGhostScore(gameSetIdx);
    }
    
    io.to(game.get('room_room_idx')).emit('end of vote', { end_of_vote: true });
    //io.to(game.get('room_room_idx')).emit('vote', { vote_rank: topVoteRankList });
};
const addGhostScore = async (gameSetIdx) => {
    const gameSet = await GameSet.findOne({
        where: {
            game_set_idx: gameSetIdx,
        },
    });
    GameSet.update(
        {
            game_set_ghost_score: gameSet.get('game_set_no'),
        },
        {
            where: {
                game_set_idx: gameSetIdx,
            },
        }
    );
};

// processId가 0번인 프로세스만 해당 메시지 받음
process.on('message', function (message) {
    if (message.topic == 'start vote') {
        timer(message.data.gameSetIdx, message.data.time, finishVote, message.data.afterFunctionParameterList);
    }else if (message.topic == 'update vote'){
        numberOfRequeststMap.set(
            message.data.mapKey,
            numberOfRequeststMap.get(message.data.gameSetIdx) + 1
        );
    }else if (message.topic == 'check to finish vote'){
        checkNumberOfVoters(message.data.gameIdx, message.data.gameSetIdx);
    }
});

module.exports = vote;