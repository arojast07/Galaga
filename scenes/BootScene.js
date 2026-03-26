/**
 * BootScene.js
 * Primera escena: genera todos los assets por código (sin archivos externos)
 * y pasa al menú principal.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Mostrar barra de carga simple
    const w = this.scale.width;
    const h = this.scale.height;
    const bar = this.add.graphics();
    const text = this.add.text(w / 2, h / 2 - 20, 'CARGANDO...', {
      fontSize: '18px', fill: '#00ccff', fontFamily: 'Courier New'
    }).setOrigin(0.5);

    this.load.on('progress', (v) => {
      bar.clear();
      bar.fillStyle(0x00ccff, 1);
      bar.fillRect(w / 2 - 100, h / 2 + 10, 200 * v, 12);
    });
  }

  create() {
    // ── Generar texturas con Graphics ──────────────────────────────────────

    // Nave del jugador (triángulo azul-cian con detalles)
    this._makePlayerTexture();

    // Enemigo básico (hexágono verde)
    this._makeEnemyBasicTexture();

    // Enemigo rápido (rombo amarillo)
    this._makeEnemyFastTexture();

    // Enemigo resistente (cuadrado rojo con borde)
    this._makeEnemyToughTexture();

    // Miniboss (estrella naranja grande)
    this._makeMinibossTexture();

    // Bala del jugador
    this._makeBulletPlayerTexture();

    // Bala enemiga
    this._makeBulletEnemyTexture();

    // Partícula de explosión
    this._makeParticleTexture();

    // Power-up doble disparo
    this._makePowerUpDoubleTexture();

    // Power-up disparo rápido
    this._makePowerUpFastTexture();

    // Power-up escudo
    this._makePowerUpShieldTexture();

    // Estrella de fondo
    this._makeStarTexture();

    // Escudo visual del jugador
    this._makeShieldTexture();

    // Pasar al menú
    this.scene.start('MenuScene');
  }

  // ── Helpers de generación de texturas ─────────────────────────────────

  _makePlayerTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // Cuerpo principal
    g.fillStyle(0x00ccff, 1);
    g.fillTriangle(20, 0, 0, 40, 40, 40);
    // Cabina
    g.fillStyle(0xffffff, 0.8);
    g.fillTriangle(20, 8, 13, 28, 27, 28);
    // Alas
    g.fillStyle(0x0088cc, 1);
    g.fillRect(0, 30, 12, 10);
    g.fillRect(28, 30, 12, 10);
    // Motor
    g.fillStyle(0xff6600, 1);
    g.fillRect(14, 38, 12, 6);
    g.generateTexture('player', 40, 44);
    g.destroy();
  }

  _makeEnemyBasicTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // Hexágono verde
    g.fillStyle(0x00ff66, 1);
    g.fillPoints([
      { x: 16, y: 0 }, { x: 32, y: 8 }, { x: 32, y: 24 },
      { x: 16, y: 32 }, { x: 0, y: 24 }, { x: 0, y: 8 }
    ], true);
    // Ojo central
    g.fillStyle(0xff0000, 1);
    g.fillCircle(16, 16, 5);
    g.fillStyle(0xffff00, 1);
    g.fillCircle(16, 16, 2);
    g.generateTexture('enemy_basic', 32, 32);
    g.destroy();
  }

  _makeEnemyFastTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // Rombo amarillo
    g.fillStyle(0xffdd00, 1);
    g.fillTriangle(14, 0, 28, 14, 14, 28);
    g.fillTriangle(14, 0, 0, 14, 14, 28);
    // Detalle interior
    g.fillStyle(0xff8800, 1);
    g.fillTriangle(14, 6, 22, 14, 14, 22);
    g.fillTriangle(14, 6, 6, 14, 14, 22);
    g.generateTexture('enemy_fast', 28, 28);
    g.destroy();
  }

  _makeEnemyToughTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // Cuerpo rojo
    g.fillStyle(0xcc0000, 1);
    g.fillRect(2, 2, 32, 32);
    // Borde brillante
    g.lineStyle(2, 0xff6666, 1);
    g.strokeRect(2, 2, 32, 32);
    // Cruz interior
    g.fillStyle(0xff3333, 1);
    g.fillRect(15, 4, 6, 28);
    g.fillRect(4, 15, 28, 6);
    // Centro
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(18, 18, 5);
    g.generateTexture('enemy_tough', 36, 36);
    g.destroy();
  }

  _makeMinibossTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // Cuerpo naranja grande
    g.fillStyle(0xff6600, 1);
    // Forma de nave grande
    g.fillTriangle(32, 0, 0, 48, 64, 48);
    g.fillStyle(0xff9900, 1);
    g.fillRect(16, 20, 32, 28);
    // Alas
    g.fillStyle(0xcc4400, 1);
    g.fillRect(0, 30, 18, 18);
    g.fillRect(46, 30, 18, 18);
    // Cañones
    g.fillStyle(0xffcc00, 1);
    g.fillRect(10, 44, 8, 14);
    g.fillRect(46, 44, 8, 14);
    // Ojo
    g.fillStyle(0xff0000, 1);
    g.fillCircle(32, 28, 10);
    g.fillStyle(0xffff00, 1);
    g.fillCircle(32, 28, 5);
    g.fillStyle(0xff0000, 1);
    g.fillCircle(32, 28, 2);
    g.generateTexture('miniboss', 64, 58);
    g.destroy();
  }

  _makeBulletPlayerTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x00ffff, 1);
    g.fillRect(2, 0, 4, 16);
    g.fillStyle(0xffffff, 1);
    g.fillRect(3, 0, 2, 6);
    g.generateTexture('bullet_player', 8, 16);
    g.destroy();
  }

  _makeBulletEnemyTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xff4444, 1);
    g.fillRect(2, 0, 4, 14);
    g.fillStyle(0xffaa00, 1);
    g.fillRect(3, 0, 2, 5);
    g.generateTexture('bullet_enemy', 8, 14);
    g.destroy();
  }

  _makeParticleTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.destroy();
  }

  _makePowerUpDoubleTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x00ffcc, 1);
    g.fillCircle(12, 12, 12);
    g.fillStyle(0x003333, 1);
    // Dos flechas hacia arriba
    g.fillTriangle(6, 14, 10, 6, 14, 14);
    g.fillTriangle(10, 14, 14, 6, 18, 14);
    g.generateTexture('powerup_double', 24, 24);
    g.destroy();
  }

  _makePowerUpFastTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffff00, 1);
    g.fillCircle(12, 12, 12);
    g.fillStyle(0x333300, 1);
    // Rayo
    g.fillTriangle(14, 2, 8, 13, 13, 13);
    g.fillTriangle(10, 11, 16, 11, 10, 22);
    g.generateTexture('powerup_fast', 24, 24);
    g.destroy();
  }

  _makePowerUpShieldTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x8888ff, 1);
    g.fillCircle(12, 12, 12);
    g.lineStyle(3, 0xffffff, 1);
    // Escudo
    g.strokeCircle(12, 12, 7);
    g.generateTexture('powerup_shield', 24, 24);
    g.destroy();
  }

  _makeStarTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(2, 2, 2);
    g.generateTexture('star', 4, 4);
    g.destroy();
  }

  _makeShieldTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.lineStyle(3, 0x8888ff, 0.8);
    g.strokeCircle(24, 24, 22);
    g.generateTexture('shield_fx', 48, 48);
    g.destroy();
  }
}
