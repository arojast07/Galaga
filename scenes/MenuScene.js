/**
 * MenuScene.js
 * Pantalla de inicio con seleccion de modo: 1 jugador o 2 jugadores.
 * Pasa data.playerCount a GameScene al iniciar.
 */
class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    var w = this.scale.width;
    var h = this.scale.height;

    this._createStarfield();

    // Titulo
    this.add.text(w / 2, 100, 'STELLAR', {
      fontSize: '52px', fill: '#00ccff', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#003366', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(w / 2, 158, 'ASSAULT', {
      fontSize: '52px', fill: '#ff6600', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#330000', strokeThickness: 6,
    }).setOrigin(0.5);

    // Nave decorativa
    var shipImg = this.add.image(w / 2, 260, 'player').setScale(2.5);
    this.tweens.add({
      targets: shipImg, y: 270, duration: 1200,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Record
    var hi = localStorage.getItem('stellarHiScore') || 0;
    this.add.text(w / 2, 310, 'RECORD: ' + hi, {
      fontSize: '14px', fill: '#ffdd00', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    // ── Opciones de modo ─────────────────────────────────────────────────
    var self = this;

    // Opcion 1 jugador
    var btn1 = this.add.text(w / 2, 390, '[ 1 JUGADOR ]', {
      fontSize: '20px', fill: '#00ccff', fontFamily: 'Courier New',
      stroke: '#003344', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // Opcion 2 jugadores
    var btn2 = this.add.text(w / 2, 440, '[ 2 JUGADORES LOCAL ]', {
      fontSize: '20px', fill: '#ff9900', fontFamily: 'Courier New',
      stroke: '#332200', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // Opcion online
    var btnOnline = this.add.text(w / 2, 490, '[ ONLINE ]', {
      fontSize: '20px', fill: '#00ff88', fontFamily: 'Courier New',
      stroke: '#003322', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // Hover effects
    btn1.on('pointerover',  function() { btn1.setColor('#ffffff'); });
    btn1.on('pointerout',   function() { btn1.setColor('#00ccff'); });
    btn2.on('pointerover',  function() { btn2.setColor('#ffffff'); });
    btn2.on('pointerout',   function() { btn2.setColor('#ff9900'); });
    btnOnline.on('pointerover',  function() { btnOnline.setColor('#ffffff'); });
    btnOnline.on('pointerout',   function() { btnOnline.setColor('#00ff88'); });

    btn1.on('pointerdown',      function() { self._startGame(1); });
    btn2.on('pointerdown',      function() { self._startGame(2); });
    btnOnline.on('pointerdown', function() { self._goOnline(); });

    // Instrucciones P1
    var s1 = { fontSize: '11px', fill: '#aaccff', fontFamily: 'Courier New' };
    this.add.text(w / 2, 540, 'P1: A/D mover  |  ESPACIO disparar', s1).setOrigin(0.5);
    this.add.text(w / 2, 556, 'P2: FLECHAS mover  |  SHIFT disparar', s1).setOrigin(0.5);
    this.add.text(w / 2, 572, 'P pausa', s1).setOrigin(0.5);

    // Parpadeo "ENTER = 1 jugador"
    var hint = this.add.text(w / 2, 610, 'ENTER para 1 jugador', {
      fontSize: '14px', fill: '#ffffff', fontFamily: 'Courier New',
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0, duration: 600, yoyo: true, repeat: -1 });

    this.add.text(w / 2, 680, 'v1.0  -  USO PERSONAL', {
      fontSize: '10px', fill: '#334455', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    // Teclado
    var enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    var key1  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    var key2  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);

    enter.once('down', function() { self._startGame(1); });
    key1.once('down',  function() { self._startGame(1); });
    key2.once('down',  function() { self._startGame(2); });
  }

  _startGame(playerCount) {
    this.scene.start('GameScene', { playerCount: playerCount });
    this.scene.start('UIScene');
    this.scene.bringToTop('UIScene');
  }

  _goOnline() {
    this.scene.start('LobbyScene');
  }

  _createStarfield() {
    var w = this.scale.width;
    var h = this.scale.height;
    this.stars = [];
    for (var i = 0; i < 120; i++) {
      var star = this.add.image(
        Phaser.Math.Between(0, w),
        Phaser.Math.Between(0, h),
        'star'
      ).setScale(Phaser.Math.FloatBetween(0.4, 1.5))
       .setAlpha(Phaser.Math.FloatBetween(0.4, 1));
      this.stars.push({ img: star, speed: Phaser.Math.FloatBetween(0.3, 1.5) });
    }
  }

  update() {
    var h = this.scale.height;
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      s.img.y += s.speed;
      if (s.img.y > h + 4) {
        s.img.y = -4;
        s.img.x = Phaser.Math.Between(0, this.scale.width);
      }
    }
  }
}
