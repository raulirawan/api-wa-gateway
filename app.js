const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const { body, validationResult } = require("express-validator");
const qrcode = require("qrcode");
const axios = require("axios");
const port = process.env.PORT || 8000;
const socketIO = require("socket.io");
const http = require("http");
const fileUpload = require("express-fileupload");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  debug: true,
}));

app.get("/", function (req, res) {
  res.sendFile("index.html", { root: __dirname });
});

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // <- this one doesn't works in Windows
      "--disable-gpu",
    ],
  },
});

client.initialize();

client.on("message", (msg) => {
  if (msg.body == "!ping") {
    msg.reply("pong");
  } else if (msg.body == "kamang") {
    msg.reply("kibing");
  }
});

// socket io connection
io.on("connection", function (socket) {
  socket.emit("message", "gas...");
  client.on("qr", (qr) => {
    console.log("QR RECEIVED", qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", "QR Code Received...");
    });
  });

  client.on("ready", () => {
    socket.emit("ready", "WhatsApp Is Ready");
    socket.emit("message", "WhatsApp Is Ready");
  });

  client.on("authenticated", () => {
    socket.emit("authenticated", "WhatsApp Is authenticated");
    socket.emit("message", "WhatsApp Is authenticated");
  });
});

const checkRegisterNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
};

// send message
app.post(
  "/send-message",
  [body("number").notEmpty(), body("message").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }
    const number = `${req.body.number}@c.us`;
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisterNumber(number);

    if (!isRegisteredNumber) {
      res.status(422).json({
        status: false,
        message: "The Number Is Not Registered",
      });
    }

    client
      .sendMessage(number, message)
      .then((response) => {
        res.status(200).json({
          status: true,
          response: response,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          response: err,
        });
      });
  }
);

// send media 
app.post(
  "/send-media", async (req, res) => {
   
    const number = `${req.body.number}@c.us`;
    const caption = req.body.caption;
    const fileUrl = req.body.file;
    // const media = MessageMedia.fromFilePath("./gambar.jpeg");
    // const file = req.files.file;
    // const media = await new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
    let mimeType;
    const attach = await axios.get(fileUrl, {responseType: 'arraybuffer'}).then(response => {
      mimeType = response.headers['content-type'];
      return response.data.toString('base64');
    })
    const media = new MessageMedia(mimeType, attach, 'Media');

    client
      .sendMessage(number, media, {caption: caption})
      .then((response) => {
        res.status(200).json({
          status: true,
          response: response,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          response: err,
        });
      });
  }
);

server.listen(port, function () {
  console.log(`App Running on ${port}`);
});
