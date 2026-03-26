/**
 * GameScene.js
 * Escena principal. Integra: modo furia, miniboss cada 3 oleadas,
 * power-ups mejorados, multiplayer local.
 */
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init(data) {
    this.playerCount  = (data && data.playerCount)  ? data.playerCount  : 1;
    // Datos online (opcionales)
    this.onlineMode   = (data && data.onlineMode)   ? data.onlineMode   : false;
    this.playerSlot   = (data && data.playerSlot)   ? data.playerSlot   : 'player1';
    this.playerName   = (data && data.playerName)   ? data.playerName   : 'PLAYER';
    this.roomId       = (data && data.roomId)        ? data.roomId       : null;
    this.roomCode     = (data && data.roomCode)      ? data.roomCode     : null;
    this.isHost       = (this.playerSlot === 'player1');
  }

  create() {
    var w = this.scale.width;
    var h = this.scale.height;

    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this._audioCtx = null;
    }

    this.score      = 0;
    this.wave       = 1;
    this.paused     = false;
    this.waveActive = false;
    this.gameOver   = false;

    // Overlay de furia (rectangulo semitransparente rojo que aparece al activarse)
    this._furyOverlay = this.add.rectangle(w / 2, h / 2, w, h, 0xff2200, 0)
      .setDepth(20).setBlendMode(Phaser.BlendModes.ADD);

    this._createStarfield();

    this.enemyBullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 60,
      runChildUpdate: true,
    });

    this.powerUps = this.physics.add.group({ runChildUpdate: true });

    // Instanciar jugadores segun modo
    this.players = [];
    if (this.playerCount >= 2) {
      this.players.push(new Player(this, w / 2 - 50, h - 60, 0, Player.getKeyConfig(0)));
      this.players.push(new Player(this, w / 2 + 50, h - 60, 1, Player.getKeyConfig(1)));
    } else {
      this.players.push(new Player(this, w / 2, h - 60, 0, Player.getKeyConfig(0)));
    }

    // En modo online el guest no controla players[0] (nave del host)
    // players[0] = host (A/D/Space), players[1] = guest (Left/Right/Shift)
    // El guest solo controla players[1] localmente; players[0] se mueve por snapshot
    if (this.onlineMode && !this.isHost && this.players[0]) {
      // Deshabilitar input local de la nave del host en el cliente del guest
      this.players[0]._isRemote = true;
      console.log('[ONLINE] players[0] marcado como remoto en cliente guest');
    }

    // Escuchar eventos de furia para el overlay
    var self = this;
    this.events.on('furyActivated', function() {
      self.tweens.add({
        targets: self._furyOverlay,
        alpha: 0.12, duration: 200, yoyo: true, repeat: 2,
        onComplete: function() { self._furyOverlay.setAlpha(0); },
      });
    });

    this.keyP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.keyP.on('down', function() { self._togglePause(); });

    // Modo online: configurar sincronizacion
    if (this.onlineMode && this.roomId) {
      console.log('[ONLINE] host/player role:', this.playerSlot);
      console.log('[ONLINE] isHost:', this.isHost);

      OnlineSync.init(this.roomId, this.playerSlot, this);

      if (this.isHost) {
        console.log('[ONLINE] host input enabled: true');
        OnlineSync.onInput(function(input) { self._applyGuestInput(input); });
      } else {
        console.log('[ONLINE] guest mode: recibiendo snapshots');
        // Inicializar pool de sprites remotos para balas
        self._initRemoteBulletPool();
        OnlineSync.onSnapshot(function(state) { self._applySnapshot(state); });
      }
    }

    this._startWave();
  }

  _startWave() {
    this.waveActive = true;

    // El guest no corre fisica de enemigos — solo refleja snapshots del host
    // Aun asi necesita el grupo de enemigos para colisiones visuales
    this.formation = new EnemyFormation(this, this.wave, this.enemyBullets);

    // En modo guest, desactivar IA de enemigos (no disparan, no se mueven solos)
    if (this.onlineMode && !this.isHost) {
      this.formation._guestMode = true;
      console.log('[ONLINE] formacion en modo guest (sin IA local)');
    }

    this._registerCollisions();

    var self = this;
    this.time.delayedCall(0, function() {
      self.events.emit('announceWave', self.wave);
      self.events.emit('updateWave',   self.wave);
      if (self.formation.isBossWave) {
        self.events.emit('announceBoss', self.wave);
      }
    });
  }

  _registerCollisions() {
    var enemies = this.formation.enemies;
    var self    = this;

    for (var i = 0; i < this.players.length; i++) {
      (function(player) {
        // Balas del jugador vs enemigos — activo en ambos modos
        self.physics.add.overlap(player.bullets, enemies,
          function(bullet, enemy) { self._onPlayerBulletHitEnemy(bullet, enemy); });

        // Daño al jugador — solo el host es autoritativo
        // El guest no procesa daño local para evitar desync
        if (!self.onlineMode || self.isHost) {
          self.physics.add.overlap(self.enemyBullets, player,
            function(bullet, pl) { self._onEnemyBulletHitPlayer(bullet, pl); });

          self.physics.add.overlap(enemies, player,
            function(enemy, pl) { self._onEnemyContactPlayer(enemy, pl); });
        }

        self.physics.add.overlap(self.powerUps, player,
          function(powerup, pl) { self._onPowerUpCollect(powerup, pl); });
      })(this.players[i]);
    }
  }

  // ── Colisiones ─────────────────────────────────────────────────────────

  _onPlayerBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    if (!bullet.body   || !enemy.body)   return;
    this._recycleBullet(bullet);
    this._spawnHitFlash(enemy.x, enemy.y, 0xffffff);
    if (enemy.takeDamage(1)) {
      this._killEnemy(enemy, bullet);
    }
  }

  _onEnemyBulletHitPlayer(a, b) {
    var bullet = (a instanceof Bullet) ? a : b;
    var player = (a instanceof Player) ? a : b;
    if (!(bullet instanceof Bullet) || !(player instanceof Player)) return;
    if (!bullet.active || !player.active) return;
    if (!bullet.body) return;
    if (player.isDead || player.isInvincible) {
      this._recycleBullet(bullet);
      return;
    }
    this._recycleBullet(bullet);

    var died = player.hit();
    this.events.emit('updateLivesP', player.playerIndex, player.lives);

    if (died) {
      this._spawnExplosion(player.x, player.y, 0x00ccff);
      this._playSfxExplosion();
      this._handlePlayerDeath(player);
    } else {
      this._spawnHitFlash(player.x, player.y, 0xff4444);
    }
  }

  _onEnemyContactPlayer(a, b) {
    var enemy  = (a instanceof Enemy)  ? a : b;
    var player = (a instanceof Player) ? a : b;
    if (!(enemy instanceof Enemy) || !(player instanceof Player)) return;
    if (!enemy.active || !player.active) return;
    if (player.isDead || player.isInvincible) return;

    var died = player.hit();
    this.events.emit('updateLivesP', player.playerIndex, player.lives);

    if (died) {
      this._spawnExplosion(player.x, player.y, 0x00ccff);
      this._playSfxExplosion();
      this._handlePlayerDeath(player);
    }
    this._killEnemy(enemy, null);
  }

  _onPowerUpCollect(a, b) {
    var powerup = (a instanceof PowerUp) ? a : b;
    var player  = (a instanceof Player)  ? a : b;
    if (!(powerup instanceof PowerUp) || !(player instanceof Player)) return;
    if (!powerup.active || !player.active || player.isDead) return;

    player.applyPowerUp(powerup.powerType);
    this._spawnHitFlash(powerup.x, powerup.y, 0x00ffcc);

    // Texto flotante del power-up recogido
    this._spawnPickupText(powerup.x, powerup.y, powerup.powerType);

    powerup.destroy();
  }

  // ── Muerte de enemigo ──────────────────────────────────────────────────

  /**
   * @param {Enemy} enemy
   * @param {Bullet|null} bullet  bala que mato al enemigo (para saber que jugador)
   */
  _killEnemy(enemy, bullet) {
    if (!enemy.active) return;
    var x    = enemy.x;
    var y    = enemy.y;
    var pts  = enemy.points;
    var type = enemy.enemyType;

    this._spawnExplosion(x, y, type === 'miniboss' ? 0xff6600 : 0xffaa00);
    this._playSfxExplosion();

    // Identificar que jugador hizo el kill para cargar su furia
    var killerIndex = (bullet && bullet.ownerIndex !== undefined) ? bullet.ownerIndex : 0;
    var killer = this.players[killerIndex] || this.players[0];

    // Multiplicador de puntos si el jugador esta en furia
    var multiplier = (killer && killer.furyMultiplier) ? killer.furyMultiplier : 1;
    this.score += pts * multiplier;
    this.events.emit('updateScore', this.score);

    // Cargar barra de furia del jugador que mato
    if (killer) killer.addFuryCharge(1);

    this._tryDropPowerUp(x, y, type);

    enemy.setActive(false).setVisible(false);
    if (enemy.body) enemy.body.reset(0, -200);
  }

  _tryDropPowerUp(x, y, type) {
    var chances = { basic: 0.08, fast: 0.13, tough: 0.25, miniboss: 1.0 };
    if (Math.random() > (chances[type] || 0.08)) return;
    var types  = ['double', 'fast', 'shield'];
    var chosen = types[Phaser.Math.Between(0, types.length - 1)];
    var pu     = new PowerUp(this, x, y, chosen);
    this.powerUps.add(pu);
  }

  _recycleBullet(bullet) {
    if (typeof bullet.kill === 'function') {
      bullet.kill();
    } else {
      bullet.setActive(false).setVisible(false);
      if (bullet.body) bullet.body.reset(0, -200);
    }
  }

  // ── Muerte del jugador ─────────────────────────────────────────────────

  _handlePlayerDeath(player) {
    var self    = this;
    var allDead = this.players.every(function(p) { return p.isDead; });

    if (allDead) {
      this.time.delayedCall(1200, function() {
        if (!self.gameOver) self._triggerGameOver();
      });
    } else {
      this.time.delayedCall(1500, function() {
        if (!self.gameOver && player.lives > 0) player.respawn();
      });
    }
  }

  _triggerGameOver() {
    this.gameOver = true;

    // Guardar score online si aplica
    if (this.onlineMode && this.roomId) {
      var self = this;
      var myPlayer = this.players[this.isHost ? 0 : 1] || this.players[0];
      ScoreService.saveScore(this.playerName, this.score, this.roomCode);
      RoomService.updateRoomStatus(this.roomId, 'finished');
      OnlineSync.destroy();
    }

    this.scene.stop('UIScene');
    this.scene.start('GameOverScene', { score: this.score, wave: this.wave });
    this.scene.stop('GameScene');
  }

  _togglePause() {
    this.paused = !this.paused;
    this.events.emit('togglePause', this.paused);
    if (this.paused) this.physics.pause();
    else             this.physics.resume();
  }

  // ── Efectos visuales ───────────────────────────────────────────────────

  _spawnExplosion(x, y, tint) {
    tint = tint || 0xffaa00;
    for (var i = 0; i < 14; i++) {
      var angle = (i / 14) * Math.PI * 2;
      var speed = Phaser.Math.Between(60, 180);
      var p = this.add.image(x, y, 'particle')
        .setTint(tint).setScale(Phaser.Math.FloatBetween(0.5, 1.5)).setDepth(10);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0, scaleX: 0, scaleY: 0,
        duration: Phaser.Math.Between(300, 600),
        ease: 'Power2',
        onComplete: (function(particle) {
          return function() { particle.destroy(); };
        })(p),
      });
    }
    var flash = this.add.circle(x, y, 20, tint, 0.9).setDepth(11);
    this.tweens.add({
      targets: flash, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 200,
      onComplete: function() { flash.destroy(); },
    });
  }

  _spawnHitFlash(x, y, color) {
    color = color || 0xffffff;
    var flash = this.add.circle(x, y, 10, color, 0.8).setDepth(10);
    this.tweens.add({
      targets: flash, scaleX: 2, scaleY: 2, alpha: 0, duration: 120,
      onComplete: function() { flash.destroy(); },
    });
  }

  /** Texto flotante al recoger un power-up */
  _spawnPickupText(x, y, type) {
    var labels = { double: 'DOBLE DISPARO', fast: 'DISPARO RAPIDO', shield: 'ESCUDO' };
    var colors = { double: '#00ffcc',       fast: '#ffff00',        shield: '#8888ff' };
    var txt = this.add.text(x, y - 10, labels[type] || type.toUpperCase(), {
      fontSize: '11px', fill: colors[type] || '#ffffff',
      fontFamily: 'Courier New', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({
      targets: txt, y: y - 50, alpha: 0, duration: 900, ease: 'Power2',
      onComplete: function() { txt.destroy(); },
    });
  }

  // ── Sonidos ────────────────────────────────────────────────────────────

  _playSfxExplosion() {
    try {
      var ctx = this._audioCtx;
      if (!ctx) return;
      var buf  = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.5);
      }
      var src  = ctx.createBufferSource();
      src.buffer = buf;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      src.connect(gain); gain.connect(ctx.destination);
      src.start();
    } catch (e) {}
  }

  // ── Fondo de estrellas ─────────────────────────────────────────────────

  _createStarfield() {
    var w = this.scale.width, h = this.scale.height;
    this._stars = [];
    for (var i = 0; i < 140; i++) {
      var star = this.add.image(
        Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), 'star'
      ).setScale(Phaser.Math.FloatBetween(0.3, 1.4))
       .setAlpha(Phaser.Math.FloatBetween(0.3, 1)).setDepth(0);
      this._stars.push({ img: star, speed: Phaser.Math.FloatBetween(0.4, 2.0) });
    }
  }

  _updateStarfield() {
    var h = this.scale.height;
    for (var i = 0; i < this._stars.length; i++) {
      var s = this._stars[i];
      s.img.y += s.speed;
      if (s.img.y > h + 4) {
        s.img.y = -4;
        s.img.x = Phaser.Math.Between(0, this.scale.width);
      }
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────

  update(time, delta) {
    if (this.gameOver) return;
    this._updateStarfield();
    if (this.paused) return;

    for (var i = 0; i < this.players.length; i++) {
      var pl = this.players[i];
      // En modo online guest: no procesar input de la nave remota (players[0])
      if (pl._isRemote) continue;
      pl.handleUpdate(time, this.paused);
    }

    if (this.formation && this.waveActive) {
      var positions = [];
      for (var j = 0; j < this.players.length; j++) {
        var p = this.players[j];
        if (!p.isDead && p.active) positions.push(p.x);
      }
      if (positions.length === 0) positions = [this.scale.width / 2];

      this.formation.update(time, delta, positions);

      if (this.formation.isEmpty()) {
        this.waveActive = false;
        this.formation.destroy();
        this.wave++;
        var self = this;
        this.time.delayedCall(2000, function() {
          if (!self.gameOver) self._startWave();
        });
      }
    }

    // Modo online: host publica snapshot, guest interpola estado remoto
    if (this.onlineMode && this.roomId) {
      if (this.isHost) {
        this._publishOnlineSnapshot();
      } else {
        // Guest: enviar inputs y aplicar interpolacion temporal cada frame
        this._sendGuestInput(time);
        this._applyInterpolatedState();
      }
    }
  }

  // ── Sincronizacion online ──────────────────────────────────────────────

  _publishOnlineSnapshot() {
    var playersState = this.players.map(function(p) {
      return {
        x:            Math.round(p.x),
        y:            Math.round(p.y),
        lives:        p.lives,
        isDead:       p.isDead,
        isInvincible: p.isInvincible,
        visible:      p.visible,
      };
    });

    var enemiesState = [];
    if (this.formation) {
      this.formation.enemies.getChildren().forEach(function(e, idx) {
        if (e.active) {
          enemiesState.push({
            id:     idx,
            x:      Math.round(e.x),
            y:      Math.round(e.y),
            hp:     e.hp,
            type:   e.enemyType,
            active: true,
          });
        }
      });
    }

    // Incluir balas del host (player1) y balas enemigas para el guest
    var bulletsState = [];
    // Balas del jugador host (player1)
    if (this.players[0] && this.players[0].bullets) {
      this.players[0].bullets.getChildren().forEach(function(b) {
        if (b.active) {
          bulletsState.push({
            id:    'p1_' + Math.round(b.x) + '_' + Math.round(b.y),
            x:     Math.round(b.x),
            y:     Math.round(b.y),
            vx:    0,
            vy:    -520,
            owner: 'player1',
          });
        }
      });
    }
    // Balas enemigas
    if (this.enemyBullets) {
      this.enemyBullets.getChildren().forEach(function(b, idx) {
        if (b.active) {
          bulletsState.push({
            id:    'eb_' + idx,
            x:     Math.round(b.x),
            y:     Math.round(b.y),
            vx:    0,
            vy:    300,
            owner: 'enemy',
          });
        }
      });
    }

    OnlineSync.publishSnapshot({
      players:  playersState,
      enemies:  enemiesState,
      bullets:  bulletsState,
      wave:     this.wave,
      score:    this.score,
      gameOver: this.gameOver,
    });
  }

  _sendGuestInput(time) {
    var p2 = this.players[1] || this.players[0];
    if (!p2 || p2.isDead || p2._isRemote) return;
    var left  = p2.keyLeft  ? p2.keyLeft.isDown  : false;
    var right = p2.keyRight ? p2.keyRight.isDown : false;
    var fire  = p2.keyFire  ? p2.keyFire.isDown  : false;
    OnlineSync.sendInput(left, right, fire);
  }

  /**
   * GUEST: inicializa el pool de sprites remotos para balas del host.
   * Se llama una vez al crear la escena en modo guest.
   */
  _initRemoteBulletPool() {
    this._remoteBullets = {};  // id -> Phaser.GameObjects.Image
    this._remoteBulletPool = [];
    // Pre-crear 40 sprites de bala para reutilizar
    for (var i = 0; i < 40; i++) {
      var spr = this.add.image(-100, -100, 'bullet_player')
        .setDepth(5).setVisible(false).setAlpha(0.85);
      this._remoteBulletPool.push(spr);
    }
    this._remoteBulletPoolIdx = 0;
    console.log('[ONLINE] guest interpolation active');
  }

  _getRemoteBulletSprite(id) {
    if (this._remoteBullets[id]) return this._remoteBullets[id];
    // Reutilizar del pool circular
    var spr = this._remoteBulletPool[this._remoteBulletPoolIdx % this._remoteBulletPool.length];
    this._remoteBulletPoolIdx++;
    // Liberar id anterior si este sprite estaba asignado
    for (var k in this._remoteBullets) {
      if (this._remoteBullets[k] === spr) { delete this._remoteBullets[k]; break; }
    }
    spr.setVisible(true);
    this._remoteBullets[id] = spr;
    return spr;
  }

  _hideUnusedRemoteBullets(activeIds) {
    for (var id in this._remoteBullets) {
      if (activeIds.indexOf(id) === -1) {
        this._remoteBullets[id].setVisible(false).setPosition(-100, -100);
        delete this._remoteBullets[id];
      }
    }
  }

  _applyInterpolatedState() {
    var state = OnlineSync.getInterpolatedState();
    if (!state) return;

    if (state.score !== undefined && state.score !== this.score) {
      this.score = state.score;
      this.events.emit('updateScore', this.score);
    }
    if (state.wave !== undefined && state.wave !== this.wave) {
      this.wave = state.wave;
      this.events.emit('updateWave', this.wave);
    }

    // ── Player1 remoto ────────────────────────────────────────────────────
    if (state.players && state.players[0] && this.players[0]) {
      var sp1 = state.players[0];
      var lp1 = this.players[0];
      if (!sp1.isDead) {
        var dx1 = sp1.x - lp1.x;
        var dy1 = sp1.y - lp1.y;
        var d1  = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        if (d1 < 3) {
          lp1.setPosition(lp1.x + dx1 * 0.5, lp1.y + dy1 * 0.5);
        } else {
          lp1.setPosition(sp1.x, sp1.y);
        }
      }
    }

    // ── Player2 reconciliacion ────────────────────────────────────────────
    if (state.players && state.players[1] && this.players[1]) {
      var sp2 = state.players[1];
      var lp2 = this.players[1];
      if (!sp2.isDead && !lp2.isDead) {
        var dx2  = sp2.x - lp2.x;
        var dy2  = sp2.y - lp2.y;
        var dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (dist > 50)       lp2.setPosition(sp2.x, sp2.y);
        else if (dist > 3)   lp2.setPosition(lp2.x + dx2 * 0.25, lp2.y + dy2 * 0.25);
        else if (dist > 0.5) lp2.setPosition(lp2.x + dx2 * 0.5,  lp2.y + dy2 * 0.5);
      }
    }

    // ── Enemigos remotos ──────────────────────────────────────────────────
    if (state.enemies && this.formation) {
      var children = this.formation.enemies.getChildren();
      var count    = state.enemies.length;
      for (var i = 0; i < children.length; i++) {
        var le = children[i];
        if (i < count) {
          var se = state.enemies[i];
          if (!le.active) { le.setActive(true).setVisible(true); }
          var dex = se.x - le.x;
          var dey = se.y - le.y;
          var de  = Math.sqrt(dex * dex + dey * dey);
          if (de > 40)    le.setPosition(se.x, se.y);
          else if (de > 1) le.setPosition(le.x + dex * 0.4, le.y + dey * 0.4);
        } else {
          if (le.active) { le.setActive(false).setVisible(false); }
        }
      }
      if (count === 0 && this.waveActive) this.waveActive = false;
    }

    // ── Balas remotas (host + enemigas) ───────────────────────────────────
    if (state.bullets && this._remoteBullets !== undefined) {
      var activeIds = [];
      for (var b = 0; b < state.bullets.length; b++) {
        var rb  = state.bullets[b];
        var spr = this._getRemoteBulletSprite(rb.id);
        spr.setPosition(rb.x, rb.y);
        // Tint segun dueno
        if (rb.owner === 'enemy') {
          spr.setTexture('bullet_enemy').setTint(0xff4444);
        } else {
          spr.setTexture('bullet_player').clearTint();
        }
        spr.setVisible(true);
        activeIds.push(rb.id);
      }
      this._hideUnusedRemoteBullets(activeIds);
    }
  }

  /**
   * GUEST: callback de snapshot autoritativo.
   * Solo maneja logica de estado (vidas, muerte, gameOver).
   * Las posiciones se manejan en _applyInterpolatedState cada frame.
   */
  _applySnapshot(state) {
    if (!state) return;

    if (state.gameOver && !this.gameOver) {
      var self = this;
      this.time.delayedCall(800, function() {
        if (!self.gameOver) self._triggerGameOver();
      });
      return;
    }

    // Sincronizar muerte de player1 remoto
    if (state.players && state.players[0] && this.players[0]) {
      var sp1 = state.players[0];
      var lp1 = this.players[0];
      if (sp1.isDead && !lp1.isDead) {
        lp1.isDead = true;
        lp1.setVisible(false);
      }
      if (!sp1.isDead && lp1.isDead) {
        lp1.isDead = false;
        lp1.setVisible(true).setAlpha(1);
      }
    }

    // Sincronizar estado autoritativo de player2
    if (state.players && state.players[1] && this.players[1]) {
      var sp2 = state.players[1];
      var lp2 = this.players[1];

      if (sp2.lives !== undefined && sp2.lives !== lp2.lives) {
        lp2.lives = sp2.lives;
        this.events.emit('updateLivesP', 1, lp2.lives);
      }

      if (sp2.isDead && !lp2.isDead) {
        console.log('[ONLINE] player2 death received from host');
        lp2.isDead = true;
        lp2.setVisible(false);
        if (lp2.shieldFx) lp2.shieldFx.setVisible(false);
        this._spawnExplosion(lp2.x, lp2.y, 0x00ccff);
        var allDead = this.players.every(function(p) { return p.isDead; });
        if (allDead) {
          var self3 = this;
          this.time.delayedCall(1200, function() {
            if (!self3.gameOver) self3._triggerGameOver();
          });
        }
      }

      if (!sp2.isDead && lp2.isDead && sp2.lives > 0) {
        lp2.isDead = false;
        lp2.setVisible(true).setAlpha(1);
        lp2.setPosition(sp2.x, sp2.y);
      }
    }
  }

  _applyGuestInput(input) {
    if (!input || !this.players[1]) return;
    var p2 = this.players[1];
    if (p2.isDead) return;
    var speed = 220;
    if (input.left)       p2.setVelocityX(-speed);
    else if (input.right) p2.setVelocityX(speed);
    else                  p2.setVelocityX(0);
    if (input.fire) {
      var now = this.time.now;
      if (now > p2.lastFired + p2.fireRate) p2._shoot(now);
    }
  }
}
