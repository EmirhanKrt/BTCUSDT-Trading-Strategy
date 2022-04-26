import express from "express";
import dotenv from 'dotenv';
import bodyParser from "body-parser";
import axios from "axios";
import path from "path"

const __dirname = path.resolve();
const app = express();
dotenv.config()

const TELEGRAM_TOKEN = process.env.telegram_TOKEN;
const TELEGRAM_CHAT_ID = process.env.telegram_CHAT_ID;

const telegramMessageSender=(message)=>{
    const URL = encodeURI("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage?chat_id=" + TELEGRAM_CHAT_ID + "&parse_mode=HTML&text=" + message)
    axios.post(URL)
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post("/tradingview_webhook", (req, res) => {
    let text;
    if(req.body.AUTH===process.env.AUTH){
        if(req.body.SIDE.includes("buy")){
            if(parseInt(req.body.POSITION_SIZE)===0){
                text="BTCUSDT - Short closed at " + req.body.PRICE;
                telegramMessageSender(text)
            }else{
                if(parseInt(req.body.POSITION_SIZE) === parseInt(req.body.COUNT)){
                    text="BTCUSDT - Long at " + req.body.PRICE + " Amount: " + req.body.COUNT + " Current Position Size: " + req.body.POSITION_SIZE;
                    telegramMessageSender(text)
                }else{
                    text="BTCUSDT - Short TP/SL received at " + req.body.PRICE + " Amount: " + req.body.COUNT  + " Current Position Size: " + req.body.POSITION_SIZE;
                    telegramMessageSender(text)
                }
            }
        }else if(req.body.SIDE.includes("sell")){
            if(parseInt(req.body.POSITION_SIZE)===0){
                text="BTCUSDT - Long closed at " + req.body.PRICE;           
                telegramMessageSender(text)         
            }else{
                if(parseInt(req.body.POSITION_SIZE)*-1 === parseInt(req.body.COUNT)){
                    text="BTCUSDT - Short at " + req.body.PRICE + " Amount: " + req.body.COUNT + " Current Position Size: " + req.body.POSITION_SIZE;
                    telegramMessageSender(text)
                }else{ 
                    text="BTCUSDT - Long TP/SL received at " + req.body.PRICE + " Amount: " + req.body.COUNT  + " Current Position Size: " + req.body.POSITION_SIZE;
                    telegramMessageSender(text)                }
            }
        }
        res.status(200).send("Correct Auth");
    } else {
      res.status(403).send("Invalid Origin");
    }
});

app.get('*', (req, res) => {
    res.sendFile("./index.html",{ root : __dirname});
 });

app.listen(5000 || process.env.PORT, (error) => {
    if (error) {
      throw new Error(error);
    }
    console.log("Backend is running");
});
