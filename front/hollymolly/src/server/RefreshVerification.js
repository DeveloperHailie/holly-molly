// 통신
import axios from "axios";
// 소켓
import { io, Socket } from "socket.io-client";

//테스트 땜시 function으로 테스트 끝나면 const로 돌려놓고,
//다른 페이지에서 불러서 테스트 해보고 푸시!, document작성해서 슬랙에 올리기

const RefreshVerification = {
  //API사용해서 catch문에 에러가 401일 때 refresh api 갱신 요청
  //API는 방 리스트 조회 사용 -> 각 각 request body나 parameter에 필요한 데이터들이 앞부분에는 없어서 가장 처음 사용하는 api로 결정

  verification() {

    console.log('리프레시 함수 call');
    /* let data = localStorage.getItem("token");
    let save_token = JSON.parse(data) && JSON.parse(data).access_token;
    let save_refresh_token = JSON.parse(data) && JSON.parse(data).refresh_token;
    let save_user_idx = JSON.parse(data) && JSON.parse(data).user_idx;
    let save_user_name = JSON.parse(data) && JSON.parse(data).user_name; */

    const BaseURL = 'http://3.17.55.178:3002/';

    //이중 장치 : 로컬스토리지 삭제
    /* localStorage.removeItem("token");
    console.log('내 refresh delete 후 : ' + JSON.stringify(localStorage.getItem("token"))); */

    let data = localStorage.getItem('token');
    let save_token = JSON.parse(data) && JSON.parse(data).access_token;
    let save_refreshToken = JSON.parse(data) && JSON.parse(data).refresh_token;
    let save_userIdx = JSON.parse(data) && JSON.parse(data).user_idx;
    let save_userName = JSON.parse(data) && JSON.parse(data).user_name;
    
    var restURL_room = BaseURL + "room";

    const reqHeaders_room = {
      headers: {
        //1번 토큰
        authorization: 
        'Bearer ' + save_token,
      },
    };
    
    //로컬스토리지에 데이터가 있다면, 방접속 api 요청
    JSON.parse(data) && axios
      .get(restURL_room, reqHeaders_room)
      .then(function (response) {
        console.log("리프레시 안에서 방접속 api 성공");
      })
      .catch(function (error) {
        var errTxt = '"로그인 후 이용해주세요."';
        // alert(JSON.stringify(error.response.data.message));
        // 로그인 후 이용해주세요 텍스트와 같다면 refresh api 요청
        //alert(JSON.stringify(error.response.data.message))
        if (errTxt === JSON.stringify(error.response.data.message)) {
          const restURL_refresh = BaseURL + "login/refresh";

          axios
            .post(restURL_refresh, {
              refresh_token: save_refreshToken,
            }, reqHeaders_room)
            .then(function (response) {
              //response로 access token 반환
              console.log("토큰만료되고 리프레시 토큰 갱신 api 요청 성공! " + response.data.access_token);

             // localStorage.removeItem("token");
             // console.log('내 refresh delete 후 : ' + JSON.stringify(localStorage.getItem("token")));

              //받은 access_token이랑 유저 인덱스로 다시 저장
              localStorage.setItem(
                "token",
                JSON.stringify({
                  access_token: response.data.access_token,
                  refresh_token: save_refreshToken,
                  user_idx: save_userIdx,
                  user_name : save_userName,
                })
              );
              console.log('내 refresh 설정 후 : ' + JSON.stringify(localStorage.getItem("token")));
            })
            .catch(function (error) {
              alert('refresh 갱신 api 에러 ' + error);
            });
        }
      });  
      return true;
    },
};

export default RefreshVerification;