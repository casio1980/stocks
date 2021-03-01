import fs from "fs";
import { Candle } from "@tinkoff/invest-openapi-js-sdk";

export function fmtNumber(number: any) { return +number.toFixed(2); }

export function loadData(figiName: string) {
  const dataFolder = `data/${figiName}`;
  const dataFiles = fs.readdirSync(dataFolder);
  return dataFiles
    .map((fileName) =>
      JSON.parse(fs.readFileSync(`${dataFolder}/${fileName}`, "utf8"))
    )
    .flat() as Candle[];
}
