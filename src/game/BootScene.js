import Phaser from 'phaser'
import stadiumUrl from './assets/cricket-stadium.webp'
import matchGroundUrl from './assets/match-ground.webp'

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene') }
  preload() {
    this.load.image('stadium', stadiumUrl)
    this.load.image('match-ground', matchGroundUrl)
  }
  create() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0x362719).fillCircle(10, 10, 10)
    g.fillStyle(0xffe6b9).fillCircle(10, 10, 8.5)
    g.fillStyle(0xffffff).fillCircle(8, 7, 5.5)
    g.lineStyle(1.6, 0xc8a780).lineBetween(6, 16, 14, 4)
    g.generateTexture('cricket-ball', 20, 20)
    g.destroy()
    this.scene.start('MenuScene')
  }
}
