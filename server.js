import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import webpush from "web-push";

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./tasks.db");

// 🔐 VAPID (le tue chiavi)
const PUBLIC_KEY =
  "BBf4IBSj9V6ADfc25vbJlC9su78w_ED6hPeYW4qgL5mqovV9KEQcC8ku1Md2BYRBJBeInGUK3FxRm15s1rfvQ4c";
const PRIVATE_KEY =
  "Lb_PPmaEGCKxJdyZaepYkbPh1KN9UGw0ck0rlJHRJgA";

webpush.setVapidDetails(
  "mailto:test@test.com",
  PUBLIC_KEY,
  PRIVATE_KEY
);

// 📦 DB
db.run(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT,
  wallet TEXT,
  date TEXT,
  notified INTEGER DEFAULT 0
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT,
  sub TEXT
)
`);

// ROOT
app.get("/", (req, res) => res.send("OK"));

// ADD TASK
app.post("/add-task", (req, res) => {
  const { task, wallet, date } = req.body;

  if (!task || !wallet) return res.send({ ok: false });

  db.run(
    "INSERT INTO tasks (task, wallet, date) VALUES (?, ?, ?)",
    [task, wallet, date],
    () => res.send({ ok: true })
  );
});

// GET TASKS
app.get("/tasks/:wallet", (req, res) => {
  db.all(
    "SELECT * FROM tasks WHERE wallet = ? ORDER BY id DESC",
    [req.params.wallet],
    (err, rows) => res.json(rows || [])
  );
});

// DELETE
app.delete("/delete-task/:id", (req, res) => {
  db.run(
    "DELETE FROM tasks WHERE id = ?",
    [req.params.id],
    () => res.send({ ok: true })
  );
});

// 🔔 SUBSCRIBE (no duplicati)
app.post("/subscribe", (req, res) => {
  const { sub, wallet } = req.body;

  const subStr = JSON.stringify(sub);

  db.get(
    "SELECT * FROM subscriptions WHERE sub = ?",
    [subStr],
    (err, row) => {
      if (row) return res.send({ ok: true });

      db.run(
        "INSERT INTO subscriptions (wallet, sub) VALUES (?, ?)",
        [wallet, subStr],
        () => res.send({ ok: true })
      );
    }
  );
});

// 🚀 TEST PUSH
app.post("/notify", (req, res) => {
  db.all("SELECT * FROM subscriptions", (err, subs) => {
    subs.forEach((s) => {
      const sub = JSON.parse(s.sub);

      webpush
        .sendNotification(
          sub,
          JSON.stringify({
            title: "🔥 TEST",
            body: "Funziona",
          })
        )
        .catch((e) =>
          console.error("PUSH ERROR:", e.statusCode)
        );
    });
  });

  res.send({ ok: true });
});

// ⏰ AUTO NOTIFY
setInterval(() => {
  db.all(
    "SELECT * FROM tasks WHERE notified = 0",
    [],
    (err, tasks) => {
      tasks.forEach((t) => {
        if (!t.date) return;

        const time = new Date(t.date).getTime();
        if (time > Date.now()) return;

        // blocca subito
        db.run(
          "UPDATE tasks SET notified = 1 WHERE id = ?",
          [t.id]
        );

        db.all(
          "SELECT * FROM subscriptions WHERE wallet = ?",
          [t.wallet],
          (e, subs) => {
            subs.forEach((s) => {
              const sub = JSON.parse(s.sub);

              webpush.sendNotification(
                sub,
                JSON.stringify({
                  title: "⏰ Task",
                  body: t.task,
                })
              );
            });
          }
        );
      });
    }
  );
}, 10000);

app.listen(3000, () =>
  console.log("http://localhost:3000")
);
