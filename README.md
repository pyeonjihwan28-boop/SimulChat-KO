# SimulChat 한국어판 (SimulChat-KO)

[SimulChat](https://github.com/mem0cypher/SimulChat)(mem0cypher 제작)을 **한국어 채팅**으로 바꾼 버전입니다.
AI 시청자들이 화면·카메라·목소리에 반응해 트위치/유튜브 라이브 채팅처럼 채팅합니다. 모든 AI는 이 PC의 Ollama에서 돌아갑니다.

## 원본과 달라진 점
- **화면 공유만 보고 반응하는 가벼운 버전**: 카메라·마이크(목소리)·사진 올리기·내 채팅 입력·음악 감지·이모트는 뺐습니다
- 화면 공유 사진을 **5초마다** AI에게 보여 줌 (밀린 사진은 버리고 최신만 분석)
- **킥오프 버튼**을 눌러야 채팅 시작, 채팅 중 **⏹ 멈추기**로 킥오프 전으로
- **채팅 속도는 시청자 수에 맞춰** (⚙에서 기본 시청자 수 설정, 기본 3만), **⚽ 골** 버튼으로 채팅 폭주
- AI 시청자 36명이 **한국어 라이브 채팅 말투**로 채팅, 화면엔 **한국식 닉네임**(말버릇 고정)
- 채팅 모델: 환경 변수 `SIMULCHAT_CHAT_MODEL` (실행 파일 기본 `exaone3.5:7.8b`), 화면 분석: `qwen2.5vl:3b`
- 유튜브 라이브 채팅(다크) 디자인

## 설치 (Windows, 처음 한 번)
1. 필요한 프로그램 (명령 창에서, 설치 후 명령 창 새로 열기)
   ```
   winget install Python.Python.3.12
   winget install OpenJS.NodeJS.LTS
   winget install Ollama.Ollama
   ```
2. AI 모델
   ```
   ollama pull exaone3.5:7.8b
   ollama pull qwen2.5vl:3b
   ```
   exaone3.5:7.8b = 한국어 채팅, qwen2.5vl:3b = 화면 분석
3. 이 저장소를 **Code → Download ZIP**으로 받아 압축 풀기

## 실행
`start_simulchat_ko.bat` 더블클릭 → 창 두 개가 뜨면 **"SimulChat 화면"** 창에 나온 주소(보통 http://localhost:5173)를 브라우저에서 엽니다.
끌 때는 두 창을 닫습니다. (처음 실행은 설치 때문에 몇 분 걸림)

## 출처·라이선스
원본: https://github.com/mem0cypher/SimulChat — 원본 README에 MIT 라이선스로 표시되어 있습니다.
원본 설명은 [README_original.md](README_original.md)에 그대로 있습니다.
