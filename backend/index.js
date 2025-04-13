const express = require("express");
const cors = require("cors");
const http = require("http");
const app = express();
const path = require("path");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const server = http.createServer(app);

app.use(cors());
const rooms = {};

let allAreTrue = false;

const resetNum = 1;

//game settings
const gameRooms = {};
const updateGameSettings = (roomId, selWord, round, time, wordCount, words) => {
  gameRooms[roomId] = {
    hints: 0,
    words: 0,
    roundNumber: 0,
    selectedWord: "",
    drawTime: 0,
    timerId: null,
    wordArray: [],
    counter: 0,
  };
  if (!gameRooms[roomId].wordArray) {
    gameRooms[roomId].wordArray = [];
  }
  gameRooms[roomId].selectedWord = selWord;
  gameRooms[roomId].wordArray = words;
  gameRooms[roomId].roundNumber = round;
  gameRooms[roomId].drawTime = time;
  gameRooms[roomId].words = wordCount;
};

const scores = {};

//countdown();

const chatHistory = {};
const generateRoomId = () => uuidv4().slice(0, 6);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let PORT = 4000;

//ESTABLISHING THE CONNECTION
io.on("connection", (socket) => {
  //JOINING THE ROOM
  socket.on("join-room", ({ roomId, name }) => {
    if (rooms[roomId]) {
      rooms[roomId].push({ name, id: socket.id });

      if (!scores[roomId]) {
        scores[roomId] = {};
      }
      if (!gameRooms[roomId]) {
        gameRooms[roomId] = {};
      }

      if (!scores[roomId][name]) {
        scores[roomId][name] = { score: 0, answerStat: false };
      }
      socket.join(roomId);
      io.to(roomId).emit("user", { rooms });
      if (rooms[roomId][0].name === name) {
        const message = `${rooms[roomId][0].name} has joined the room and is owner`;
        chatHistory[roomId].push({ message: message, name: "admin" });
      } else {
        const message = `${name} has joined the room`;
        chatHistory[roomId].push({ message: message, name: "admin" });
      }
      const message2 = `${rooms[roomId][0].name} is the room owner`;

      //chatHistory[roomId].push({message:message2 , name:'admin'})
      //io.to(roomId).emit("rec", { message, name: "admin", roomId });
      if (chatHistory[roomId]) {
        io.to(roomId).emit("set-chat-history", { chatHistory });
      }
      //io.to(roomId).emit("rec" , {message: message2 , name : "admin"})
      //console.log(rooms);
      io.to(roomId).emit("turn-update", rooms[roomId][0].name);
    } else {
      io.to(socket.id).emit("error", "Room not found");
    }
  });

  //CREATING THE ROOM
  socket.on("create-room", () => {
    const roomId = generateRoomId();
    rooms[roomId] = [];

    if (!chatHistory[roomId]) {
      chatHistory[roomId] = [];
    }

    if (!gameRooms[roomId]) {
      gameRooms[roomId] = {};
    }
    socket.join(roomId);
    io.to(socket.id).emit("room-created", roomId); // Confirm room creation
    //console.log(`Room created and ${socket.id} joined room: ${roomId}`);
  });

  function restoreLetters(selectedWord, dashWord) {
    let randomIndex = Math.floor(Math.random() * selectedWord.length);
    dashWord = dashWord.split("");
    dashWord[randomIndex] = selectedWord[randomIndex];
    dashWord = dashWord.join("");

    return dashWord;
  }

  //SET SELECTED WORD
  socket.on(
    "set-selected-word",
    ({ roomId, selWord, rounds, drawTime, numberOfWords, words }) => {
      if (!gameRooms[roomId]) {
        gameRooms[roomId] = {}; // Initialize if missing
      }

      let dashWord = selWord.replace(/\S/g, "_");
      io.to(roomId).emit("sel-word", { selWord, dashWord });
      updateGameSettings(
        roomId,
        selWord,
        rounds,
        drawTime,
        numberOfWords,
        words
      );
    }
  );

  socket.on("updated-dash", ({ selectedWord, dashes, roomId }) => {
    console.log("dashupdated")
    let dashWord = restoreLetters(selectedWord, dashes);
    io.to(roomId).emit("sel-word", { selWord: selectedWord, dashWord });
  });

  //SETTING UP CHAT HISTORY
  socket.on("chat-history", ({ data, roomId }) => {
    const { name, message } = data;
    chatHistory[roomId].push({ name, message });
    //console.log(chatHistory);
  });

  socket.on("hide-word-select", ({ showWordSelect, roomId }) => {
    io.to(roomId).emit("show-word-select", showWordSelect);
  });

  //TO CHANGE GAME SETTINGS
  socket.on(
    "change-game-settings",
    ({ time, round, roomId, wordCount, words, selWord, hints, maxPlayers }) => {
      if (!gameRooms[roomId]) {
        gameRooms[roomId] = {};
      }
      console.log(hints);
      updateGameSettings(
        roomId,
        selWord,
        round,
        time,
        wordCount,
        words,
        maxPlayers
      );
      io.to(roomId).emit("set-game-settings", {
        drawingTime: time,
        roundCount: round,
        wordCount,
        hints: hints,
        maxPlayers: maxPlayers,
      });
    }
  );

  //NEXT TURN
  const nextTurn = (roomId) => {
    let room = rooms[roomId];
    

    if (!room || room.length === 0) return;

    let currentIndex = room.findIndex((user) => user.name === room.name);
    room.name = room[currentIndex]?.name;
    if(scores[roomId][room.name]){
      
    }
    

    if (currentIndex === -1) {
      //console.log(`Error: Current drawer (${room.name}) not found!`);
      currentIndex = 0; // Default to the first user if not found
    }

    let nextIndex = (currentIndex + 1) % room.length;
    room.name = room[nextIndex].name;
    

    //console.log(`New turn: ${room.name}`);
    io.to(roomId).emit("turn-update", room.name);
  };

  const restartTimer = (roomId, round) => {
    io.to(roomId).emit("round-number", round);

    if (timers[roomId]) {
      clearTimeout(timers[roomId]); // Clear previous countdown if it exists
    }

    countdown(roomId); // Start fresh countdown
  };

  //function to implement timer
  const timers = {};
  let r = 1;
  let c = 0;

  function topscorers(roomId) {
    const roomScores = Object.entries(scores[roomId]).map(([name, data]) => ({
      name,
      score: data.score,
    }));

    const tempScorers = [...roomScores]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // Take the first 3 elements

      return tempScorers;
  }

  async function countdown(roomId) {
    if (!gameRooms[roomId]) {
      gameRooms[roomId] = {};
    }
    io.to(roomId).emit("randomize-words", gameRooms[roomId].words);
    io.to(roomId).emit("show-rounds", true);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    io.to(roomId).emit("show-rounds", false);
    io.to(roomId).emit("show-word-select", true);
    if (timers[roomId]) {
      clearTimeout(timers[roomId]);
    }

    async function tick() {
      // Check if the countdown has reached the draw time
      if (c === gameRooms[roomId].drawTime || allAreTrue) {
        Object.values(scores[roomId]).forEach(
          (user) => (user.answerStat = false)
        );
        allAreTrue = false;
        io.to(roomId).emit("result", scores[roomId]); // Emit result when timer reaches draw time
        c = 0; // Reset the counter

        // Wait for 4 seconds before moving to the next round
        await new Promise((resolve) => setTimeout(resolve, 4000));
        r++; // Increment round counter

        io.to(roomId).emit("timerUpdate", 0); // Reset timer on UI
        io.to(roomId).emit("clearCanvas", { roomId, r }); // Clear the canvas for the new round
        nextTurn(roomId); // Move to the next player's turn

        // If rounds are not finished, restart timer
        if (r <= gameRooms[roomId].roundNumber) {
          restartTimer(roomId, r);
        }
        if (r > gameRooms[roomId].roundNumber && c === 0) {
          async function reset() {
            io.to(roomId).emit("top-scorers" , topscorers(roomId));
            r = resetNum;
            io.to(roomId).emit("clearCanvas", { roomId, r });
            io.to(roomId).emit("show-final-result", true);
            await new Promise((resolve) => setTimeout(resolve, 3000));
            io.to(roomId).emit("show-final-result", false);
            io.to(roomId).emit("game-started", { showGameSetup: true });
            console.log(r);
          }
          reset();
        }

        // Clean up timers for the room
        delete timers[roomId];
        return;
      } else {
        c++; // Increment the timer
        io.to(roomId).emit("timerUpdate", c); // Emit the updated timer

        // Hide word select option after 15 seconds
        if (c === 10) {
          io.to(roomId).emit("show-word-select", false);
          if (gameRooms[roomId].selectedWord === "") {
            if (!gameRooms[roomId]) {
              gameRooms[roomId] = {};
            }
            let dashWord = gameRooms[roomId].wordArray[0].replace(/\S/g, "_");
            io.to(roomId).emit("sel-word", {
              selWord: gameRooms[roomId].wordArray[0],
              dashWord,
            });
          }
        }

        // Recursively call tick every 1 second
        timers[roomId] = setTimeout(tick, 1000);
      }
    }

    tick(); // Start the countdown
  }

  //starting the game
  socket.on("start-game", ({ showGameSetup, roomId }) => {
    if (rooms[roomId].length < 2) {
      io.to(roomId).emit("rec", {
        name: "admin",
        message: "minimum 2 players required",
      });
    } else {
      console.log(rooms[roomId].length);
      if (showGameSetup === false) {
        io.to(roomId).emit("game-started", showGameSetup);

        countdown(roomId);
      }
    }
  });

  socket.on(
    "set-words",
    ({ arrOfWords, roomId, selWord, round, time, wordCount }) => {
      if (!gameRooms[roomId] || !gameRooms[roomId].wordArray) {
        gameRooms[roomId] = {};
        gameRooms[roomId].wordArray = [];
      }
      updateGameSettings(roomId, selWord, round, time, wordCount, arrOfWords);
    }
  );

  function checkAndResetAnswerStat(roomId) {
    const allTrue = Object.values(scores[roomId]).every(
      (user) => user.answerStat
    );

    // Reset all answerStat values to false
    //

    return allTrue;
  }

  // Message handling within a room
  socket.on("message", (data) => {
    const { roomId, name, message, count , currentDrawer} = data;
    let cleanMessage = message.replace(/[\n\r]/g, "");
    if (cleanMessage === gameRooms[roomId].selectedWord) {
      const message1 = `${name} has guessed the word`;
      io.to(roomId).emit("rec", { name: "correct", message: message1 });
      io.to(roomId).emit("correct-names", name);
      scores[roomId][name].answerStat = true;
      scores[roomId][currentDrawer].answerStat = true;
      if(scores[roomId][name].answerStat === true){
        io.to(roomId).emit("rec", {name: "admin" , message: "already guessed"})
      }

      console.log(checkAndResetAnswerStat(roomId));
      allAreTrue = checkAndResetAnswerStat(roomId);
      if (count < gameRooms[roomId].drawTime / 10) {
        scores[roomId][name].score = scores[roomId][name].score + 300;
      }
      if (
        gameRooms[roomId].drawTime / 10 <
        count <
        gameRooms[roomId].drawTime / 5
      ) {
        scores[roomId][name].score = scores[roomId][name].score + 200;
      }
      if (
        gameRooms[roomId].drawTime / 5 <
        count <
        gameRooms[roomId].drawTime / 2
      ) {
        scores[roomId][name].score = scores[roomId][name].score + 100;
      } else {
        scores[roomId][name].score = scores[roomId][name].score + 0;
      }
    } else {
      io.to(roomId).emit("rec", data);
    }
  });

  // Drawing event within a room
  socket.on("drawing", (data) => {
    const { roomId } = data;
    socket.broadcast.to(roomId).emit("drawing", data);
  });

  //disconnect
  socket.on("disconnect", () => {
    console.log(`${socket.id} disconnected`);

    for (let roomId in rooms) {
      let disconnectedUser = null;

      const userIndex = rooms[roomId].findIndex(
        (user) => user.id === socket.id
      );
      if (userIndex !== -1) {
        disconnectedUser = rooms[roomId][userIndex].name;
      }

      rooms[roomId] = rooms[roomId].filter((user) => user.id !== socket.id);
      //console.log(rooms[roomId]); // Log the specific room's updated users

      // Emit the updated user list to remaining users in the room
      const message = `${disconnectedUser} has left the room`;
      //const message2 = `${rooms[roomId][0].name} is the room owner `
      io.to(roomId).emit("user", { rooms });
      if (disconnectedUser !== null) {
        chatHistory[roomId].push({ message: message, name: "admin" });
        if (chatHistory[roomId]) {
          io.to(roomId).emit("set-chat-history", { chatHistory });
        }
        //io.to(roomId).emit("rec", { message, name: "admin" });
        //io.to(roomId).emit("rec" , { message: message2 , name: "admin"})
      }
    }
  });
});


server.listen(PORT, () => console.log("Server started on port", PORT));
