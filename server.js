const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 
});

const animals = [
    "Lion", "Tiger", "Wolf", "Fox", "Falcon", "Panda", "Bear", "Eagle",
    "Hawk", "Jaguar", "Leopard", "Otter", "Rabbit", "Koala", "Raven",
    "Shark", "Whale", "Dolphin", "Cobra", "Python", "Moose", "Buffalo"
];

const users = {};
const history = [];

function randomName() {
    return animals[Math.floor(Math.random() * animals.length)] + "-" + Math.floor(1000 + Math.random() * 9000);
}

function save(msg) {
    history.push(msg);
    if (history.length > 100) history.shift();
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
    let name = "";
    let expiresAt = null;

    socket.on("initSession", (clientSession) => {
        if (clientSession && clientSession.name && clientSession.expiresAt && Date.now() < clientSession.expiresAt) {
            name = clientSession.name;
            expiresAt = clientSession.expiresAt;
        } else {
            name = randomName();
            expiresAt = null;
        }

        users[socket.id] = { id: socket.id, name, expiresAt };

        socket.emit("sessionReady", { name, expiresAt, history });
        io.emit("count", Object.keys(users).length);
        io.emit("usersUpdate", Object.values(users));
        io.emit("system", `${name} joined the room`);
    });

    socket.on("updateSession", (data) => {
        expiresAt = data ? data.expiresAt : null;
        if (users[socket.id]) {
            users[socket.id].expiresAt = expiresAt;
        }
    });

    socket.on("requestNewIdentity", () => {
        const oldName = name;
        name = randomName();
        expiresAt = null;
        if (users[socket.id]) {
            users[socket.id].name = name;
            users[socket.id].expiresAt = null;
        }
        socket.emit("sessionReady", { name, expiresAt: null, history: [] });
        io.emit("usersUpdate", Object.values(users));
        io.emit("system", `${oldName} changed identity to ${name}`);
    });

    socket.on("message", (payload) => {
        if (!payload) return;
        const text = typeof payload === 'string' ? payload.trim() : (payload.text || '').trim();
        const image = typeof payload === 'object' ? payload.image : null;

        if (!text && !image) return;

        const msg = {
            id: Date.now() + Math.random().toString(36).substring(2, 5),
            name,
            text,
            image,
            time: Date.now()
        };
        save(msg);
        io.emit("message", msg);
    });

    /* WebRTC Signaling Handlers */
    socket.on("callUser", (data) => {
        io.to(data.targetSocketId).emit("incomingCall", {
            fromSocketId: socket.id,
            callerName: data.callerName,
            callType: data.callType,
            signal: data.signal
        });
    });

    socket.on("acceptCall", (data) => {
        io.to(data.targetSocketId).emit("callAccepted", {
            fromSocketId: socket.id,
            answererName: data.answererName,
            signal: data.signal
        });
    });

    socket.on("rejectCall", (data) => {
        io.to(data.targetSocketId).emit("callRejected", {
            byName: data.byName
        });
    });

    socket.on("sendIceCandidate", (data) => {
        io.to(data.targetSocketId).emit("iceCandidate", {
            candidate: data.candidate
        });
    });

    socket.on("endCall", (data) => {
        io.to(data.targetSocketId).emit("callEnded");
    });

    socket.on("typing", () => {
        socket.broadcast.emit("typing", name);
    });

    socket.on("stopTyping", () => {
        socket.broadcast.emit("stopTyping");
    });

    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("count", Object.keys(users).length);
        io.emit("usersUpdate", Object.values(users));
        io.emit("system", `${name} left the room`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
});