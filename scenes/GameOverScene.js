/**
 * GameOverScene.js
 * Pantalla de Game Over con puntuación final y opción de reinicio.
 */
class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.finalScore = data.score || 0;
    this.wave       = data.wave  || 1;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Fondo oscuro semitransparente
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.85);

    // Título
    this.add.text(w / 2, 160, 'GAME OVER', {
      fontSize: '48px',
      fill: '#ff2200',
      fontFamily: 'Courier New',
      fontStyle: 'bold',
      stroke: '#330000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // Puntuación
    this.add.text(w / 2, 270, `PUNTUACIÓN: ${this.finalScore}`, {
      fontSize: '22px', fill: '#ffffff', fontFamily: 'Courier New'
    }).setOrigin(0.5);

    // Oleada alcanzada
    this.add.text(w / 2, 310, `OLEADA ALCANZADA: ${this.wave}`, {
      fontSize: '16px', fill: '#aaaaaa', fontFamily: 'Courier New'
    }).setOrigin(0.5);

    // Récord
    const hi = localStorage.getItem('stellarHiScore') || 0;
    this.add.text(w / 2, 350, `RÉCORD: ${hi}`, {
      fontSize: '18px', fill: '#ffdd00', fontFamily: 'Courier New'
    }).setOrigin(0.5);

    // Nuevo récord
    if (this.finalScore >= hi && this.finalScore > 0) {
      const newHi = this.add.text(w / 2, 390, '¡NUEVO RÉCORD!', {
        fontSize: '20px', fill: '#ff9900', fontFamily: 'Courier New'
      }).setOrigin(0.5);
      this.tweens.add({ targets: newHi, alpha: 0, duration: 500, yoyo: true, repeat: -1 });
    }

    // Instrucción de reinicio
    const restartText = this.add.text(w / 2, 480, 'ENTER  para reiniciar', {
      fontSize: '16px', fill: '#00ccff', fontFamily: 'Courier New'
    }).setOrigin(0.5);
    this.tweens.add({ targets: restartText, alpha: 0, duration: 600, yoyo: true, repeat: -1 });

    this.add.text(w / 2, 520, 'ESC  para volver al menú', {
      fontSize: '14px', fill: '#888888', fontFamily: 'Courier New'
    }).setOrigin(0.5);

    // Controles
    const enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const esc   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    enter.once('down', () => this._restart());
    esc.once('down',   () => this._menu());

    this.input.once('pointerdown', () => this._restart());
  }

  _restart() {
    // Detener UIScene anterior y reiniciar todo
    this.scene.stop('UIScene');
    this.scene.stop('GameOverScene');
    this.scene.start('GameScene');
    this.scene.start('UIScene');
    this.scene.bringToTop('UIScene');
  }

  _menu() {
    this.scene.stop('UIScene');
    this.scene.stop('GameOverScene');
    this.scene.start('MenuScene');
  }
}
