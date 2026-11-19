import Phaser from 'phaser'
import BootScene from './BootScene.js'
import MenuScene from './MenuScene.js'
import MatchScene from './MatchScene.js'

export function createGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#09231f',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 540, parent },
    render: { antialias: true, pixelArt: false, powerPreference: 'low-power' },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [BootScene, MenuScene, MatchScene]
  })
}
