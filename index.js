import express from "express";
import dotenv from 'dotenv';
import bodyParser from "body-parser";
import axios from "axios";
import path from "path"
import Binance from "node-binance-api";

const __dirname = path.resolve();
const app = express();
dotenv.config()

var port = process.env.PORT || 8000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const APIKEY = process.env.APIKEY;
const APISECRET = process.env.APISECRET;
const LAVARAGE = process.env.LAVARAGE;

const binance = new Binance().options({
    APIKEY,
    APISECRET
});


const anyOpenPositions = async (SYMBOL) => {
    try {
        const positions = await binance.futuresPositionRisk();
        const filteredPosition = positions.filter((element) => element.symbol === SYMBOL)[0];
        if (filteredPosition) {
            let positionAmt = parseFloat(filteredPosition.positionAmt);
            if (positionAmt === 0.000) {
                console.log("There aren't any position.")
                return { isPositionActive: false };
            } else {
                return { isPositionActive: true, positionAmt, margin: filteredPosition.isolatedWallet, entryPrice: filteredPosition.entryPrice };
            }
        } else {
            console.log("SYMBOL ERROR")
            return { isPositionActive: false };
        }
    } catch (error) {
        console.log(error);
        return { isPositionActive: false };
    }
}

const positionSide = (positionAmt) => {
    /*
        SHORT = 0
        LONG = 1
    */
    let side;
    positionAmt > 0 ? (side = 1) : (side = 0)
    return side;
}

const printPosition = (positionAmt, margin, entryPrice) => {
    return (`Side: ${positionSide(positionAmt) ? ("Long") : ("Short")} \nPosition Amount: ${positionAmt} \nMargin: ${margin} \nEntry Price: ${entryPrice}`);
}

const setLavarage = async (LAVARAGE) => {
    try {
        const { isPositionActive, positionAmt, margin, entryPrice } = await anyOpenPositions("BTCUSDT");
        if (!isPositionActive) {
            await binance.futuresMarginType('BTCUSDT', 'ISOLATED')
            await binance.futuresLeverage('BTCUSDT', LAVARAGE)
            console.log(`Successfully setted BTCUSDT Perpetual Margin Mode: ${"Isolated"} and Lavarage: ${LAVARAGE}`)
        } else {
            console.log(`There are already open position so cant change Lavarage.`)
        }
    } catch (error) {
        console.log(error);
    }
}

const getMaxOpenablePosition = async () => {
    const balances = await binance.futuresBalance();
    const USDT_BALANCE = balances.filter((element) => element.asset === "USDT")[0].availableBalance;
    const BTCPRICE = await binance.futuresMarkPrice("BTCUSDT");
    const BTCPRICE_number = parseFloat(BTCPRICE["markPrice"]);
    const max_value = USDT_BALANCE * LAVARAGE / BTCPRICE_number;
    return (parseFloat(max_value.toFixed(3)) - 0.001);
}

const positionHandler = async (action, count, position_size, price) => {
    try {
        let max = await getMaxOpenablePosition();
        let { isPositionActive, positionAmt, margin, entryPrice } = await anyOpenPositions("BTCUSDT");
        let text = "BTCUSDT - " + action + " @ Price " + price;
        price=parseFloat(price).toFixed();
        if (isPositionActive) {
            console.log(printPosition(positionAmt, margin, entryPrice))

            if (position_size < 0) {
                position_size *= (-1)
            }

            let total = (parseFloat(position_size) + parseFloat(count));
            let willClose = (parseFloat(count));
            let estCloseRate = (willClose / total);
            let amount = parseFloat((positionAmt * estCloseRate).toFixed(3));
            let profitRatio = positionSide(positionAmt) ? (`${(((parseFloat(price) / parseFloat(entryPrice) - 1) * 100)).toFixed(3)}`) : (`${(((parseFloat(entryPrice) / parseFloat(price) - 1) * 100)).toFixed(3)}`);
            text += " Close position's: " + estCloseRate * 100 + "%\n" + "Profit: " + profitRatio + "% ";
            switch (action) {
                case "CLOSE_SHORT":
                    await binance.futuresBuy("BTCUSDT", Math.abs(positionAmt), price,{reduceOnly: true})
                    break;
                case "TP_SHORT":
                    await binance.futuresBuy("BTCUSDT", Math.abs(amount), price,{reduceOnly: true})
                    break;
                case "CLOSE_LONG":
                    await binance.futuresSell("BTCUSDT", Math.abs(positionAmt), price,{reduceOnly: true})
                    break;
                case "TP_LONG":
                    await binance.futuresSell("BTCUSDT", Math.abs(amount), price,{reduceOnly: true})
                    break;
                default:
                    break;
            }
        } else {
            switch (action) {
                case "OPEN_SHORT":
                    await binance.futuresSell("BTCUSDT", Math.abs(max), price,{reduceOnly: true});
                    break;
                case "OPEN_LONG":
                    await binance.futuresBuy("BTCUSDT", Math.abs(max), price,{reduceOnly: true})
                    break;
                default:
                    break;
            }
        }
        await telegramMessageSender(text);
    } catch (error) {
        console.log(error);
    }

}

const telegramMessageSender = async (message) => {
    try {
        const URL = encodeURI("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage?chat_id=" + TELEGRAM_CHAT_ID + "&parse_mode=HTML&text=" + message)
        await axios.post(URL)
    } catch (error) {
        console.log(error)
    }
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post("/tradingview_webhook", async (req, res) => {
    try {
        let action;
        if (req.body.AUTH === process.env.AUTH) {
            if (req.body.SIDE.includes("buy")) {
                if (parseInt(req.body.POSITION_SIZE) === 0) {
                    action = "CLOSE_SHORT";
                } else {
                    if (parseInt(req.body.POSITION_SIZE) === parseInt(req.body.COUNT)) {
                        action = "OPEN_LONG";
                    } else {
                        action = "TP_SHORT";
                    }
                }
            } else if (req.body.SIDE.includes("sell")) {
                if (parseInt(req.body.POSITION_SIZE) === 0) {
                    action = "CLOSE_LONG";
                } else {
                    if (parseInt(req.body.POSITION_SIZE) * -1 === parseInt(req.body.COUNT)) {
                        action = "OPEN_SHORT";
                    } else {
                        action = "TP_LONG";
                    }
                }
            }
            await positionHandler(action, req.body.COUNT, req.body.POSITION_SIZE, req.body.PRICE);
            res.status(200).send("Correct Auth");
        } else {
            res.status(403).send("Invalid Origin");
        }
    } catch (error) {
        console.log(error)
    }

});

app.get('*', (req, res) => {
    res.sendFile("./index.html", { root: __dirname });
});

app.listen(port, (error) => {
    if (error) {
        throw new Error(error);
    }
    console.log("Backend is running");
});

setLavarage(LAVARAGE);