const express = require("express");

const app = express();

app.get("/", (req, res) => {
    res.send("No content here yet");
});

app.listen(8080);