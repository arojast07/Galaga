/**
 * UIScene.js
 * HUD: score, record, vidas, oleada, power-up activo, barra de furia.
 */
class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    var w = this.scale.width;
    var h = this.scale.height;

    // Barra superior
    this.add.rectangle(0, 0, w, 36, 0x000022, 0.8).setOrigin(0, 0);

    this.scoreLabel = this.add.text(8, 8, 'SCORE: 0', {
      fontSize: '13px', fill: '#00ccff', fontFamily: 'Courier New',
    });

    var hi = localStorage.getItem('stellarHiScore') || 0;
    this.hiLabel = this.add.text(w / 2, 8, 'RECORD: ' + hi, {
      fontSize: '13px', fill: '#ffdd00', fontFamily: 'Courier New',
    }).setOrigin(0.5, 0);

    this.waveLabel = this.add.text(w - 8, 8, 'OLEADA: 1', {
      fontSize: '13px', fill: '#ff9900', fontFamily: 'Courier New',
    }).setOrigin(1, 0);

    // Vidas P1 y P2
    this.lifeIconsP1 = [];
    this.lifeIconsP2 = [];
    this._buildLifeIcons(this.lifeIconsP1, 3, 8, h - 22, 0xffffff);
    this._buildLifeIcons(this.lifeIconsP2, 0, w - 8, h - 22, 0xff9900);

    // Power-up labels
    this.puLabelP1 = this.add.text(8, h - 38, '', {
      fontSize: '11px', fill: '#00ffcc', fontFamily: 'Courier New',
    }).setAlpha(0);

    this.puLabelP2 = this.add.text(w - 8, h - 38, '', {
      fontSize: '11px', fill: '#ff9900', fontFamily: 'Courier New',
    }).setOrigin(1, 0).setAlpha(0);

    // ── BARRA DE FURIA (P1) ───────────────────────────────────────────────
    // Fondo de la barra
    this._furyBg = this.add.rectangle(w / 2, h - 10, 120, 8, 0x222222, 0.9)
      .setOrigin(0.5, 1);
    // Relleno de la barra
    this._furyFill = this.add.rectangle(w / 2 - 60, h - 10, 0, 8, 0xff4400, 1)
      .setOrigin(0, 1);
    // Label
    this._furyLabel = this.add.text(w / 2, h - 20, 'FURIA', {
      fontSize: '9px', fill: '#ff8800', fontFamily: 'Courier New',
    }).setOrigin(0.5, 1).setAlpha(0.7);

    // Indicador FURIA ACTIVA
    this.furyActiveText = this.add.text(w / 2, h / 2 + 40, 'MODO FURIA', {
      fontSize: '22px', fill: '#ff4400', fontFamily: 'Courier New',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    // Pausa
    this.pauseText = this.add.text(w / 2, h / 2, 'PAUSA', {
      fontSize: '36px', fill: '#ffffff', fontFamily: 'Courier New',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false);

    // Anuncio de oleada
    this.waveAnnounce = this.add.text(w / 2, h / 2 - 40, '', {
      fontSize: '28px', fill: '#ff9900', fontFamily: 'Courier New',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    // Anuncio de boss
    this.bossAnnounce = this.add.text(w / 2, h / 2 - 10, '', {
      fontSize: '20px', fill: '#ff2200', fontFamily: 'Courier New',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    // Escuchar eventos de GameScene
    var gs   = this.scene.get('GameScene');
    var self = this;
    gs.events.on('updateScore',    function(s)          { self._onScore(s); });
    gs.events.on('updateLivesP',   function(idx, l)     { self._onLivesP(idx, l); });
    gs.events.on('updateWave',     function(wv)         { self._onWave(wv); });
    gs.events.on('togglePause',    function(p)          { self._onPause(p); });
    gs.events.on('announceWave',   function(wv)         { self._announceWave(wv); });
    gs.events.on('announceBoss',   function(wv)         { self._announceBoss(wv); });
    gs.events.on('updatePowerUp',  function(idx, t, d)  { self._onPowerUp(idx, t, d); });
    gs.events.on('updateFury',     function(idx, c, m, active) { self._onFury(idx, c, m, active); });
    gs.events.on('furyActivated',  function()           { self._onFuryActivated(); });
    gs.events.on('furyDeactivated',function()           { self._onFuryDeactivated(); });

    this.events.once('destroy', function() {
      gs.events.off('updateScore');
      gs.events.off('updateLivesP');
      gs.events.off('updateWave');
      gs.events.off('togglePause');
      gs.events.off('announceWave');
      gs.events.off('announceBoss');
      gs.events.off('updatePowerUp');
      gs.events.off('updateFury');
      gs.events.off('furyActivated');
      gs.events.off('furyDeactivated');
    });
  }

  _buildLifeIcons(arr, count, startX, y, tint) {
    arr.forEach(function(i) { i.destroy(); });
    arr.length = 0;
    var dir = (tint === 0xff9900) ? -1 : 1;
    for (var i = 0; i < count; i++) {
      var icon = this.add.image(startX + dir * i * 28, y, 'player')
        .setScale(0.55).setTint(tint);
      arr.push(icon);
    }
  }

  _onScore(score) {
    if (!this.scoreLabel || !this.hiLabel) return;
    this.scoreLabel.setText('SCORE: ' + score);
    var hi = parseInt(localStorage.getItem('stellarHiScore') || '0', 10);
    if (score > hi) localStorage.setItem('stellarHiScore', score);
    this.hiLabel.setText('RECORD: ' + Math.max(score, hi));
  }

  _onLivesP(playerIndex, lives) {
    if (!this.lifeIconsP1 || !this.lifeIconsP2) return;
    var count = Math.max(0, lives);
    var w = this.scale.width, y = this.scale.height - 22;
    if (playerIndex === 1) this._buildLifeIcons(this.lifeIconsP2, count, w - 8, y, 0xff9900);
    else                   this._buildLifeIcons(this.lifeIconsP1, count, 8, y, 0xffffff);
  }

  _onWave(wave) {
    if (!this.waveLabel) return;
    this.waveLabel.setText('OLEADA: ' + wave);
  }

  _onPause(paused) {
    if (!this.pauseText) return;
    this.pauseText.setVisible(paused);
  }

  _announceWave(wave) {
    if (!this.waveAnnounce) return;
    this.waveAnnounce.setText('- OLEADA ' + wave + ' -').setAlpha(1);
    this.tweens.add({ targets: this.waveAnnounce, alpha: 0, delay: 1500, duration: 600 });
  }

  _announceBoss(wave) {
    if (!this.bossAnnounce) return;
    this.bossAnnounce.setText('!! MINIBOSS !!').setAlpha(1);
    this.tweens.add({
      targets: this.bossAnnounce,
      alpha: 0, delay: 2000, duration: 500,
    });
  }

  _onPowerUp(playerIndex, type, duration) {
    var label = playerIndex === 1 ? this.puLabelP2 : this.puLabelP1;
    if (!label) return;
    var labels = { double: 'DOBLE DISPARO', fast: 'DISPARO RAPIDO', shield: 'ESCUDO' };
    var colors = { double: '#00ffcc', fast: '#ffff00', shield: '#8888ff' };

    if (!type) {
      this.tweens.add({ targets: label, alpha: 0, duration: 300 });
      return;
    }
    label.setText(labels[type] || type.toUpperCase())
         .setColor(colors[type] || '#ffffff').setAlpha(1);

    var self = this;
    this.time.delayedCall(duration * 0.8, function() {
      if (label && label.alpha > 0) {
        self.tweens.add({ targets: label, alpha: 0, duration: 200, yoyo: true, repeat: 4 });
      }
    });
  }

  _onFury(playerIndex, charge, max, active) {
    // Solo mostrar barra de P1 en el HUD central
    if (playerIndex !== 0) return;
    if (!this._furyFill) return;

    if (active) {
      this._furyFill.setFillStyle(0xff2200).setSize(120, 8);
    } else {
      var ratio = Math.min(1, charge / max);
      var color = ratio > 0.7 ? 0xff2200 : ratio > 0.4 ? 0xff8800 : 0xffdd00;
      this._furyFill.setFillStyle(color).setSize(120 * ratio, 8);
    }
  }

  _onFuryActivated() {
    if (!this.furyActiveText) return;
    this.furyActiveText.setAlpha(1);
    this.tweens.add({
      targets: this.furyActiveText,
      alpha: 0.3, duration: 300, yoyo: true, repeat: -1,
    });
  }

  _onFuryDeactivated() {
    if (!this.furyActiveText) return;
    this.tweens.killTweensOf(this.furyActiveText);
    this.tweens.add({ targets: this.furyActiveText, alpha: 0, duration: 400 });
  }
}
