import { Candle, CandleResolution } from "@tinkoff/invest-openapi-js-sdk";
import { EMA, MACD } from "technicalindicators";
import { figiUSD, figiTWTR, DATE_FORMAT } from "./const";
import { info } from "./lib/logger";
import fs from "fs";
import getAPI from "./lib/api";
import moment from "moment";

require("dotenv").config();

const api = getAPI();
const isProduction = process.env.PRODUCTION === "true";

if (isProduction) info("*** PRODUCTION MODE ***");

(async function () {
  try {
    const interval: CandleResolution = "day";
    const filename = `data/twtr-${interval}.json`;

    /*
    const portfolio = await api.portfolio();
    const { positions } = portfolio;

    const usd = positions.find((el) => el.figi === figiUSD);
    info(positions);
    */
    /*
    const from = `${moment().startOf("year").format(DATE_FORMAT)}T00:00:00Z`;
    const to = `${moment().add(1, "days").format(DATE_FORMAT)}T00:00:00Z`;
    const { candles } = await api.candlesGet({
      from,
      to,
      figi: figiTWTR,
      interval,
    });
    fs.writeFileSync(filename, JSON.stringify(candles), "utf8");
    */

    const twtr = JSON.parse(fs.readFileSync(filename, "utf8")) as Candle[];

    const fastPeriod = 12;
    const slowPeriod = 26;
    const fastOffset = fastPeriod - 1;
    const slowOffset = slowPeriod - 1;
    const values = twtr.map(({ c }) => c);

    const ema = EMA.calculate({ values, period: fastPeriod });
    const macd = MACD.calculate({
      values,
      fastPeriod,
      slowPeriod,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const result = twtr.map((item, i) => ({
      ...item,
      ema: ema[i - fastOffset],
      macd: macd[i - slowOffset],
    }));

    console.log(">", result);
  } catch (err) {
    info("FATAL", err);
  }
})();
