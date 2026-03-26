/**
 * STELLAR ASSAULT - main.js
 * Punto de entrada: configura Phaser y registra todas las escenas.
 */

const GAME_WIDTH  = 480;
const GAME_HEIGHT = 720;

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#000010',
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, LobbyScene, GameScene, UIScene, GameOverScene],
};

const game = new Phaser.Game(config);
