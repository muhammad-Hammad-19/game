import Phaser from 'phaser'

// A lightweight animated stadium sits behind React's accessible menu controls.
export default class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene') }
  create() {
    const { width, height } = this.scale
    this.add.image(width / 2, height / 2, 'stadium').setDisplaySize(width, height)
    this.add.rectangle(width / 2, height / 2, width, height, 0x071b15, .18)
  }
}
