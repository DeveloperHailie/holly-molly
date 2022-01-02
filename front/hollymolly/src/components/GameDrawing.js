import React, { createRef, useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import styled from 'styled-components';
import style from '../styles/styles';
import RefreshVerification from '../server/RefreshVerification';
//import Toast from '../components/Toast';
import * as _ from 'lodash';

import axios from 'axios';

//RefreshVerification.verification();

import html2canvas from 'html2canvas';
import { useHistory, useLocation } from 'react-router';

let data = localStorage.getItem('token');
let save_token = JSON.parse(data) && JSON.parse(data).access_token;
let save_user_idx = JSON.parse(data) && JSON.parse(data).user_idx;
let save_user_name = JSON.parse(data) && JSON.parse(data).user_name;

const GameDrawing = (props) => {
    const history = useHistory();

    const {gameSetNo, gameIdx, socket, leaderIdx, order, color, room_idx, idx, member_count, role,  setIdx, userList, keyword} = props;

    const [possible, setPossible] = useState(true);
    const [seconds, setSeconds] = useState(10); // 그림 그리기 타이머
    const [waitSeconds, setWaitSeconds] = useState(-1); // 순서 받기 타이머, 그림 다 그린 후 타이머 실행되야 하므로 일단 -1 으로 초기화
    const [secondsLoading, setSecondsLoading] = useState(-1); //투표 전 로딩 구현을 위한 타이머
    const [readyNextOrder, setReadyNextOrder] = useState(false); // 다음 순서 준비 완료 소켓 값을 관리하는 상태 값
    const [reDraw, setReDraw] = useState(false); // 다시 그리기 위해 canvas 관리하는 상태 값

    const orderCount = useRef(1); // orderCount
    const drawingTime = useRef(true); // 그릴 수 있는 시간을 관리하는 변수

    useEffect(() => {        
        socket.on('connect', () => {
            console.log('game drawing connection server');
        });
    }, []);

    let user_order = parseInt(order);
    let user_color = color; 
    
    // 지정 색 코드로 바꿔주기 
    if(user_color === 'RED'){
        user_color = '#FF0000';
    }else if(user_color === 'ORANGE'){
        user_color = '#FF5C00'
    }else if(user_color === 'YELLOW'){
        user_color = '#FFB800'
    }else if(user_color === 'GREEN'){
        user_color = '#95DB3B'
    }else if(user_color === 'BLUE'){
        user_color = '#3B8EDB'
    }else if(user_color === 'PINK'){
        user_color = '#CE3BDB'
    }else{
        user_color = '#823BDB'
    }

    let user_room_index = parseInt(room_idx);
    let user_idx = parseInt(idx);
    let user_member_count = parseInt(member_count);

    let canvas;
    let canvasRef = createRef();

    let pos = {
        drawable: false,
        X: -1,
        Y: -1,
    };

    let oldPos = {
        X: -1,
        Y: -1,
    };

    let ctx;

    useEffect(() => {
        canvas = canvasRef.current;
        ctx = canvas.getContext('2d');

        // DEFAULT 스타일 값 지정
        ctx.strokeStyle = user_color;
        ctx.lineWidth = 3;

        canvas.addEventListener('mousedown', initDraw); // 그림 그리기 시작
        canvas.addEventListener('mousemove', draw); // 그림 그리기
        canvas.addEventListener('mouseup', finishDraw); // 그림 그리기 종료
        canvas.addEventListener('mouseout', finishDraw); // 그림 그리기 종료
    }, [reDraw]);

    // 초기 세팅
    function initDraw(event) {
        if (orderCount.current === user_order && drawingTime.current) {
            // 자기 순서 일때만 그리기 // props.order
            ctx.beginPath();
            pos = { drawable: true, ...getPosition(event) };
            ctx.moveTo(pos.X, pos.Y);
            oldPos = { X: pos.X, Y: pos.Y };
        }
    }

    // 그림 그리는 중
    function draw(event) {
        if (pos.drawable) {
            pos = { ...pos, ...getPosition(event) };
            ctx.lineTo(pos.X, pos.Y);
            ctx.stroke();

            // 실시간으로 그림 좌표 계속 전송
            socket.emit('draw', {
                room_idx: user_room_index, // props.room_idx
                draw_info: {
                    color: ctx.strokeStyle,
                    previous_x: oldPos.X,
                    previous_y: oldPos.Y,
                    current_x: pos.X,
                    current_y: pos.Y,
                },
            });

            oldPos = { X: pos.X, Y: pos.Y };
        }
    }

    // 그림 그리기 종료
    function finishDraw() {
        pos = { drawable: false, X: -1, Y: -1 };
    }

    function getPosition(event) {
        return { X: event.offsetX, Y: event.offsetY };
    }

    useEffect(() => {
        socket.on('draw', (data) => {
            // 그림 좌표 받기
            // 자기 순서가 아니면 받은 그림 좌표 그려주기
            if (orderCount.current !== user_order) {
                // props.order
                ctx.strokeStyle = data.color;
                ctx.beginPath();
                ctx.moveTo(data.previous_x, data.previous_y);
                ctx.lineTo(data.current_x, data.current_y);
                ctx.stroke();
            }
        });

        socket.on('get next turn', (data) => {
            // 그림 좌표 받기
            console.log(data.message); // success 메시지
            setReadyNextOrder(true);
            //setReDraw(false);
        });
    }, []);

    // 그림 그리기 타이머
    useEffect(() => {
        const countdown = setInterval(() => {
            if (parseInt(seconds) > 0) {
                setSeconds(parseInt(seconds) - 1);
            } else if (parseInt(seconds) === 0) {
                // 타이머 종료,
                console.log('그림 그리기 시간 끝');

                drawingTime.current = false; // 그림 그리기 시간 끝
                setPossible(false);
                if (orderCount.current === user_member_count) {
                    clearInterval(countdown);
                    console.log('모든 순서 끝!');
                    //세트 이미지 저장 api 요청
                    saveCanvas();
                    //투표 로딩 타이머 시작 
                    setSecondsLoading(10);
                } else {
                    // 다음 순서 받을 준비 완료
                    socket.emit('send next turn', {
                        room_idx: user_room_index,
                        user_idx: user_idx,
                        member_count: user_member_count,
                        draw_order: orderCount.current
                    });

                    // 다음 순서 받을 준비 완료 소켓 보내고 3초 시간 잼
                    setWaitSeconds(3);
                    //여기야, 내가 바꾼 코드
                    setSeconds(-1);
                    setPossible(false);
                }
            }
        }, 1000);

        return () => {
            clearInterval(countdown);
        };
    }, [seconds]);

    // 순서 받기 타이머
    useEffect(() => {
        const waitcountdown = setInterval(() => {
            if (parseInt(waitSeconds) > 0) {
                setWaitSeconds(parseInt(waitSeconds) - 1);
            } else if (parseInt(waitSeconds) === 0) {
                // 3초가 지나도 받지 못하면 네트워크 에러 및 서버에서 강제 퇴장 처리

                if (readyNextOrder) {
                    console.log('다음 순서 받기');
                    setWaitSeconds(-1);
                    setReadyNextOrder(false); // 다시 다음 순서 받을 준비
                    orderCount.current += 1; // 순서 바꾸기
                    setReDraw(!reDraw); // 그리기 준비
                    drawingTime.current = true;
                    setPossible(true);
                    setSeconds(10);
                } else {
                    console.log('순서 받기 시간 끝');
                    alert('네트워크가 불안정합니다.');
                    window.location.replace('/');
                    
                    setWaitSeconds(-1);
                }
            }
        }, 1000);

        return () => {
            clearInterval(waitcountdown);
        };
    }, [waitSeconds]);

    //투표하기 전에 고민의 10초 세기
    useEffect(() => {
            const countdown = setInterval(() => {
                if (parseInt(secondsLoading) > 0) {
                    setSecondsLoading(parseInt(secondsLoading) - 1);
                }
                if (parseInt(secondsLoading) === 0) {
                    history.push({
                        pathname: '/playingvote/' + room_idx,
                        state: {gameSetNo : gameSetNo, gameIdx : gameIdx, leaderIdx: leaderIdx , move: '10초', userList: userList, roomIdx: room_idx, gameSetIdx: setIdx, keyword: keyword, role: role },
                    });
                    setSecondsLoading(-1);
                }
            }, 1000);

            return () => {
                clearInterval(countdown);
            };
    }, [secondsLoading]);

    const onClick = () => {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); // 그림 초기화
    };

    const saveCanvas = () => {
        const canvas = document.getElementById('draw');
        
        const imgBase64 = canvas.toDataURL('image/png', 'image/octet-stream');
        const decodImg = window.atob(imgBase64.split(',')[1]);
      
        let array = [];
        for (let i = 0; i < decodImg .length; i++) {
          array.push(decodImg .charCodeAt(i));
        }
      
        var date =+ new Date();

        const file = new Blob([new Uint8Array(array)], {type: 'image/png'});
        const fileName = room_idx + '_' + date + '.png';
        let formData = new FormData();

        formData.append('set_image', file, fileName);
        //formData.append('file', file, "21_1202");

        const restURL = 'http://3.17.55.178:3002/game/set/image/' + setIdx; //게임세트 인덱스 넣기

        const reqHeaders = {
            headers: {
                authorization: 'Bearer ' + save_token,
            },
        };      
        
        axios
            .patch(
                restURL, formData,
                reqHeaders
            )
            .then(function (response) {
                console.log('이미지 저장 성공');
            })
            .catch(function (error) {
                alert('이미지 error ' + error.message);
            });       
    }

    //downloadURI, Save 는 지울 예정 정희
    /* function downloadURI(uri, name){
        var link = document.createElement("a")
        link.download = name;
        link.href = uri;
        document.body.appendChild(link);
        link.click();
    } */

    let ImgUrl; //타이머 이미지 URL이 들어갈 곳

    // 현재 순서 유저 찾기 
    var currentItem = userList.find((x) => x.game_member_order === orderCount.current);

     // 순서에 따른 자기 순서 표시(하위 -> 상위)
    /* const sendOrder = () => {
        props.currentOrder(currentItem.user_idx);
    } */

    let cursor_status;
    // 순서에 따른 토스트 표시 
    const toast = () => {
        if(drawingTime.current === true){
            if(currentItem.user_idx === save_user_idx){
                cursor_status = true;
                return <div><Toast>🎨 {currentItem.user_name} 님이 그림을 그릴 차례입니다.</Toast></div>;
            }else{
                cursor_status = false;
                return <div><Toast>🎨 {currentItem.user_name} 님이 그림을 그리고 있습니다.</Toast></div>;
            }
        }
    }

     // 지정 색 코드로 바꿔주기 
     let border_user_color = currentItem.user_color && currentItem.user_color; 
    
     if(drawingTime.current === true){
        if(border_user_color === 'RED'){
            border_user_color = '#FF0000';
        }else if(border_user_color === 'ORANGE'){
            border_user_color = '#FF5C00'
        }else if(border_user_color === 'YELLOW'){
            border_user_color = '#FFB800'
        }else if(border_user_color === 'GREEN'){
            border_user_color = '#95DB3B'
        }else if(border_user_color === 'BLUE'){
            border_user_color = '#3B8EDB'
        }else if(border_user_color === 'PINK'){
            border_user_color = '#CE3BDB'
        }else if(border_user_color === 'WHITE'){
            border_user_color = '#FFFFFF'
        }else{
            border_user_color = '#823BDB'
        }
     }
     else{
        border_user_color = 'transparent'
     }

     

    return (
        <div>
            <div>{toast()}</div> 
            {secondsLoading !== -1? <TimerToast>📢 투표 {secondsLoading} 초 전</TimerToast> : null}
            <Container>      
                {/* {seconds === 10 ? sendOrder() : null}  */}
                <DrawingContainer color={border_user_color} cursor={cursor_status}>
                    <canvas id = "draw" ref={canvasRef} width="610" height={'600'}></canvas>
                </DrawingContainer>
                {
                    (
                     possible === true
                     ?
                    ((ImgUrl = '../assets/timer_' + seconds + '.png'),
                    seconds > 0 ? (
                        <img
                            src={require('../assets/timer_' + seconds + '.png').default}
                            style={{
                                width: '80px',
                                height: '50px',
                                backgroundSize: 'contain',
                                marginTop: '20px',
                                zIndex: '1',
                                marginLeft: '-100px',
                            }}
                        />
                    ) : (
                        ''
                    ))
                    : '')
                }
            </Container>
            {/* <button onClick={onClick}>초기화</button> */}
            {/* <button onClick={saveCanvas}>저장</button> */}
        </div>
    );
};

const Container = styled.div`
    background-color: #ffffff;
    width: 610px;
    height: 600px;
    display: flex;
    border-radius: 15px;
    
`;

const Toast = styled.div`
    background-color: #ffffff;
    width: 300px;
    height: 30px;
    display: flex;
    border-radius: 10px;
    position: absolute;
    margin-left: 220px;
    margin-top: -85px;
    align-items: center; 
    justify-content: flex-start;
    padding: 10px;
    color: black;
    box-shadow: 5px 5px 15px #808080;
`;

const TimerToast = styled.div`
    background-color: #ffffff;
    width: 120px;
    height: 30px;
    display: flex;
    border-radius: 10px;
    position: absolute;
    margin-left: 280px;
    margin-top: -85px;
    align-items: center; 
    justify-content: center;
    padding: 10px;
    color: black;
    box-shadow: 5px 5px 15px #808080;
`;

const DrawingContainer = styled.div`
    background-color: #ffffff;
    border-radius: 15px;
    border-width: 3px;
    border-style: solid;
    border-color: #ffffff;
    ${(props) => `box-shadow: 0px 0px 5px 5px ${props.color};`}
    ${(props) => (props.cursor === true ? `cursor: pointer;` : `cursor: not-allowed;`)}
    
    
`;

export default GameDrawing;