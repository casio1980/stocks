import { Status } from './types'
import { makeAutoObservable } from "mobx"
import { CandleStreaming, PortfolioPosition } from "@tinkoff/invest-openapi-js-sdk";
import { fmtNumber } from "./lib/utils";
import { STATUS_IDLE } from "./const";

export class Store {
  status: Status = STATUS_IDLE
  position?: PortfolioPosition = undefined
  buyCandle?: CandleStreaming = undefined

  candles: CandleStreaming[] = []

  constructor(candles: CandleStreaming[]) {
    makeAutoObservable(this, {
      candles: false
    })

    this.candles = candles
  }

  get isIdle() {
    return this.status === STATUS_IDLE
  }

  get hasPosition() {
    return !!this.position
  }

  get lotsAvailable() {
    return this.position?.lots || 0
  }

  get buyTime() {
    return this.buyCandle?.time
  }

  get buyPrice() {
    return this.position?.averagePositionPrice?.value || this.buyCandle?.c
  }

  get takePrice() {
    if (!this.buyPrice) return
    return fmtNumber(this.buyPrice * (1 + 0.075))
  }

  get stopPrice() {
    if (!this.buyPrice) return
    return fmtNumber(this.buyPrice * (1 - 0.011))

    // const { candles, prevCandle } = this

    // if (!prevCandle) return
    // const initialStop = prevCandle.o - 0.05 // 0.2

    // const nCount = 1 // 32 // 25
    // const nCandles = candles.slice(Math.max(candles.length - nCount - 1, 0), candles.length - 1)
    // const nLow = nCandles.length === nCount ? Number(Math.min(...nCandles.map(c => c.l)).toFixed(1)) : 0 // TODO fmtNumber

    // return fmtNumber(Math.max(nLow, initialStop))

    // const { candles, buyTime } = this
    // const buyCandleIndex = candles.findIndex(c => c.time === buyTime)
    // if (buyCandleIndex <= 0) return undefined

    // const prevBuyCandle = candles[buyCandleIndex - 1]
    // const initialStop = fmtNumber(prevBuyCandle.o - 0.05) // 0.2

    // const nCount = 32 // 25
    // const nCandles = candles.slice(Math.max(candles.length - nCount - 1, 0), candles.length - 1)
    // const nLow = nCandles.length === nCount ? Number(Math.min(...nCandles.map(c => c.l)).toFixed(1)) : 0 // TODO fmtNumber

    // return Math.max(nLow, initialStop)
  }

  get prevCandle() {
    const { candles, buyTime } = this
    const buyCandleIndex = candles.findIndex(c => c.time === buyTime)

    return buyCandleIndex > 0 ? candles[buyCandleIndex - 1] : undefined
  }

  setStatus(status: Status) {
    this.status = status
  }

  setPosition(position: PortfolioPosition) {
    this.position = position
  }

  setBuyCandle(candle: CandleStreaming) {
    this.buyCandle = candle
  }
}