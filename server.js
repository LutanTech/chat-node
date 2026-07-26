console.log("SERVER LOADED", new Date().toISOString());
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7,
    pingInterval: 10000,
    pingTimeout: 20000
});

const animals = [
    "Lion", "Tiger", "Wolf", "Fox", "Falcon", "Panda", "Bear", "Eagle",
    "Hawk", "Jaguar", "Leopard", "Otter", "Rabbit", "Koala", "Raven",
    "Shark", "Whale", "Dolphin", "Cobra", "Python", "Moose", "Buffalo"
];

const users = {};
const history = [];

const pendingDisconnects = {};
const DISCONNECT_GRACE_MS = 25000;

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
    let currentUserId = null;
    let name = "";
    let expiresAt = null;

    socket.on("initSession", (clientSession) => {
        currentUserId = (clientSession && clientSession.userId) ? clientSession.userId : "usr_" + Math.random().toString(36).substring(2, 9);

        const isReconnecting = !!pendingDisconnects[currentUserId];

        if (isReconnecting) {
            clearTimeout(pendingDisconnects[currentUserId]);
            delete pendingDisconnects[currentUserId];
        }

        if (clientSession && clientSession.name && clientSession.expiresAt && Date.now() < clientSession.expiresAt) {
            name = clientSession.name;
            expiresAt = clientSession.expiresAt;
        } else if (users[currentUserId] && users[currentUserId].name) {
            name = users[currentUserId].name;
            expiresAt = users[currentUserId].expiresAt;
        } else {
            name = randomName();
            expiresAt = null;
        }

        users[currentUserId] = {
            id: currentUserId,
            socketId: socket.id,
            name,
            expiresAt,
            lastActive: Date.now()
        };

        socket.emit("sessionReady", {
            userId: currentUserId,
            name,
            expiresAt,
            history
        });

        io.emit("count", Object.keys(users).length);
        io.emit("usersUpdate", Object.values(users));

        if (!isReconnecting) {
            io.emit("system", `${name} joined the room`);
        }
    });

    socket.on("updateSession", (data) => {
        expiresAt = data ? data.expiresAt : null;
        if (currentUserId && users[currentUserId]) {
            users[currentUserId].expiresAt = expiresAt;
        }
    });

    socket.on("requestNewIdentity", () => {
        const oldName = name;
        name = randomName();
        expiresAt = null;

        if (currentUserId && users[currentUserId]) {
            users[currentUserId].name = name;
            users[currentUserId].expiresAt = null;
        }

        socket.emit("sessionReady", {
            userId: currentUserId,
            name,
            expiresAt: null,
            history: []
        });

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
            userId: currentUserId,
            name,
            text,
            image,
            time: Date.now(),
            readBy: [],
            reactions: {}
        };
        save(msg);
        io.emit("message", msg);
    });

    socket.on("markRead", (msgIds) => {
        if (!Array.isArray(msgIds) || !currentUserId) return;
        let updated = false;

        msgIds.forEach(msgId => {
            const msg = history.find(m => m.id === msgId);
            if (msg && msg.userId !== currentUserId) {
                if (!msg.readBy) msg.readBy = [];
                if (!msg.readBy.some(r => r.userId === currentUserId)) {
                    msg.readBy.push({
                        userId: currentUserId,
                        name,
                        time: Date.now()
                    });
                    updated = true;
                }
            }
        });

        if (updated) {
            io.emit("historyUpdate", history);
        }
    });

    socket.on("toggleReaction", ({ msgId, emoji }) => {
        const msg = history.find(m => m.id === msgId);
        if (msg && emoji) {
            if (!msg.reactions) msg.reactions = {};
            if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

            const existingIdx = msg.reactions[emoji].findIndex(r => r.userId === currentUserId);
            if (existingIdx > -1) {
                msg.reactions[emoji].splice(existingIdx, 1);
                if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
            } else {
                msg.reactions[emoji].push({ userId: currentUserId, name });
            }

            io.emit("messageUpdated", msg);
        }
    });

    socket.on("deleteMessage", ({ msgId }) => {
        const index = history.findIndex(m => m.id === msgId);
        if (index > -1) {
            const targetMsg = history[index];
            if (targetMsg.userId === currentUserId || targetMsg.name === name) {
                history.splice(index, 1);
                io.emit("messageDeleted", { msgId });
            }
        }
    });

    socket.on("callUser", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("incomingCall", {
                fromUserId: currentUserId,
                fromSocketId: socket.id,
                callerName: data.callerName,
                callType: data.callType,
                signal: data.signal
            });
        }
    });

    socket.on("acceptCall", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("callAccepted", {
                fromUserId: currentUserId,
                fromSocketId: socket.id,
                answererName: data.answererName,
                signal: data.signal
            });
        }
    });

    socket.on("rejectCall", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("callRejected", {
                byName: data.byName
            });
        }
    });

    socket.on("sendIceCandidate", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("iceCandidate", {
                candidate: data.candidate
            });
        }
    });

    socket.on("endCall", (data) => {
        const targetUser = users[data.targetUserId];
        if (targetUser) {
            io.to(targetUser.socketId).emit("callEnded");
        }
    });

    socket.on("typing", () => {
        socket.broadcast.emit("typing", name);
    });

    socket.on("stopTyping", () => {
        socket.broadcast.emit("stopTyping");
    });

    socket.on("disconnect", () => {
        if (!currentUserId) return;

        pendingDisconnects[currentUserId] = setTimeout(() => {
            const disconnectedUser = users[currentUserId];
            delete users[currentUserId];
            delete pendingDisconnects[currentUserId];

            io.emit("count", Object.keys(users).length);
            io.emit("usersUpdate", Object.values(users));
            if (disconnectedUser) {
                io.emit("system", `${disconnectedUser.name} left the room`);
            }
        }, DISCONNECT_GRACE_MS);
    });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
});