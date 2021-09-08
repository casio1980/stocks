import fs from "fs";
import { Candle } from "@tinkoff/invest-openapi-js-sdk";

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function fmtNumber(number: any) { return +number.toFixed(2); }

export function isRegularMarket(date: string) {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes() >= 17 * 60 + 30;
}

export function isClosingMarket(date: string) {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes() >= 23 * 60 + 30;
}

export function loadData(figiName: string) {
  const dataFolder = `data/${figiName}`;
  const dataFiles = fs.readdirSync(dataFolder);
  return dataFiles
    .map((fileName) =>
      JSON.parse(fs.readFileSync(`${dataFolder}/${fileName}`, "utf8"))
    )
    .flat() as Candle[];
}
