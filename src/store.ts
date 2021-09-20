import { Status } from './types'
import { makeAutoObservable } from "mobx"
import { CandleStreaming, MoneyAmount, PortfolioPosition } from "@tinkoff/invest-openapi-js-sdk";
import { fmtNumber } from "./lib/utils";
import { STATUS_IDLE, COMMISSION } from "./const";

export class Store {
  status: Status = STATUS_IDLE

  stopLimit: number = 0
  takeLimit: number = 0   

  moneyAmount?: MoneyAmount = undefined
  position?: PortfolioPosition = undefined
  buyCandle?: CandleStreaming = undefined

  candles: CandleStreaming[] = []

  constructor(candles?: CandleStreaming[]) {
    makeAutoObservable(this, {
      candles: false
    })

    this.candles = candles // TODO remove candles from store
  }

  get isIdle() {
    return this.status === STATUS_IDLE
  }

  get money() {
    return this.moneyAmount?.value || 0
  }

  get hasPosition() {
    return !!this.position
  }

  get positionPrice() {
    return this.lots * this.buyPrice
  }

  get lots() {
    return this.position?.lots || 0
  }

  get buyTime() {
    return this.buyCandle?.time
  }

  get buyPrice() {
    return this.position?.averagePositionPrice?.value || this.buyCandle?.c
  }

  get noProfitPrice() {
    if (!this.buyPrice) return
    return fmtNumber(this.buyPrice * (1 + COMMISSION * 2))
  }

  get takePrice() {
    if (!this.buyPrice) return
    return fmtNumber(this.buyPrice * (1 + this.takeLimit))
  }

  get stopPrice() {
    if (!this.buyPrice) return
    return fmtNumber(this.buyPrice * (1 - this.stopLimit))
  }

  get prevCandle() {
    const { candles, buyTime } = this
    const buyCandleIndex = candles?.findIndex(c => c.time === buyTime)

    return buyCandleIndex > 0 ? candles[buyCandleIndex - 1] : undefined
  }

  setStatus(status: Status) {
    this.status = status
  }

  setMoney(money: MoneyAmount) {
    this.moneyAmount = money
  }

  setPosition(position: PortfolioPosition) {
    this.position = position
  }

  setLimits({ stopLimit, takeLimit }: { stopLimit: number, takeLimit: number }) {
    this.stopLimit = stopLimit
    this.takeLimit = takeLimit
  }

  setBuyCandle(candle: CandleStreaming) {
    this.buyCandle = candle
  }
}