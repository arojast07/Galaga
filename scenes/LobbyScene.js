/**
 * LobbyScene.js
 * Pantalla de lobby online: escribir nombre, crear sala, unirse con codigo,
 * ver scores. Estilo arcade retro.
 *
 * Flujo:
 *   1. Jugador escribe nombre
 *   2. Crea sala -> muestra codigo -> espera guest
 *   3. O ingresa codigo -> se une -> espera inicio
 *   4. Cuando sala esta "ready" -> inicia GameScene online
 */
class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' });
  }

  create() {
    var w    = this.scale.width;
    var h    = this.scale.height;
    var self = this;

    this._roomChannel = null;
    this._roomId      = null;
    this._roomCode    = null;
    this._playerSlot  = null;
    this._playerName  = '';

    this._createStarfield();
    this._buildUI();
    this._loadScores();
  }

  // ── UI principal ───────────────────────────────────────────────────────

  _buildUI() {
    var w    = this.scale.width;
    var h    = this.scale.height;
    var self = this;

    // Titulo
    this.add.text(w / 2, 38, 'STELLAR ASSAULT', {
      fontSize: '22px', fill: '#00ccff', fontFamily: 'Courier New',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(w / 2, 62, 'MODO ONLINE', {
      fontSize: '13px', fill: '#ff6600', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    // ── Campo nombre ──────────────────────────────────────────────────────
    this.add.text(w / 2, 100, 'TU NOMBRE:', {
      fontSize: '12px', fill: '#aaccff', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    // Input de nombre via DOM (overlay sobre el canvas)
    this._nameInput = this._createDomInput(w / 2 - 80, 112, 160, 24, 'Ej: PILOT_X');

    // ── Crear sala ────────────────────────────────────────────────────────
    var btnCreate = this._makeButton(w / 2, 162, '[ CREAR SALA ]', '#00ccff');
    btnCreate.on('pointerdown', function() { self._onCreateRoom(); });

    // ── Unirse a sala ─────────────────────────────────────────────────────
    this.add.text(w / 2, 196, 'CODIGO DE SALA:', {
      fontSize: '12px', fill: '#aaccff', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    this._codeInput = this._createDomInput(w / 2 - 40, 208, 80, 24, '0000');

    var btnJoin = this._makeButton(w / 2, 250, '[ UNIRSE ]', '#ff9900');
    btnJoin.on('pointerdown', function() { self._onJoinRoom(); });

    // ── Volver al menu local ──────────────────────────────────────────────
    var btnLocal = this._makeButton(w / 2, 286, '[ JUGAR LOCAL ]', '#888888');
    btnLocal.on('pointerdown', function() { self._goLocal(); });

    // ── Panel de estado de sala ───────────────────────────────────────────
    this._statusText = this.add.text(w / 2, 320, '', {
      fontSize: '12px', fill: '#ffdd00', fontFamily: 'Courier New',
      align: 'center',
    }).setOrigin(0.5);

    this._codeDisplay = this.add.text(w / 2, 344, '', {
      fontSize: '28px', fill: '#ff4400', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Scores ────────────────────────────────────────────────────────────
    this.add.text(w / 2, 380, '── ULTIMOS SCORES ──', {
      fontSize: '11px', fill: '#334455', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    this._scoresContainer = this.add.text(w / 2, 400, 'Cargando...', {
      fontSize: '10px', fill: '#556677', fontFamily: 'Courier New',
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Error ─────────────────────────────────────────────────────────────
    this._errorText = this.add.text(w / 2, h - 30, '', {
      fontSize: '11px', fill: '#ff4444', fontFamily: 'Courier New',
    }).setOrigin(0.5);
  }

  // ── Acciones ───────────────────────────────────────────────────────────

  async _onCreateRoom() {
    var name = this._getNameValue();
    if (!name) return;
    this._playerName = name;
    this._setStatus('Creando sala...');
    this._clearError();

    try {
      var result = await RoomService.createRoom(name);
      this._roomId     = result.roomId;
      this._roomCode   = result.roomCode;
      this._playerSlot = 'player1';

      this._setStatus('SALA CREADA\nEsperando jugador 2...');
      this._codeDisplay.setText(result.roomCode);

      this._subscribeToRoom();
    } catch (e) {
      console.error('[LOBBY] error al crear sala:', e);
      this._setError('Error: ' + (e.message || String(e)));
      this._setStatus('');
    }
  }

  async _onJoinRoom() {
    var name = this._getNameValue();
    if (!name) return;
    var code = this._getCodeValue();
    if (!code || code.length !== 4) {
      this._setError('Ingresa un codigo de 4 digitos.');
      return;
    }
    this._playerName = name;
    this._setStatus('Buscando sala ' + code + '...');
    this._clearError();

    try {
      var result = await RoomService.joinRoom(code, name);

      if (!result) {
        this._setError('Sala no encontrada o no disponible.');
        this._setStatus('');
        return;
      }

      if (result.full) {
        this._setError('Sala llena. Ya tiene 2 jugadores.');
        this._setStatus('');
        return;
      }

      this._roomId     = result.roomId;
      this._roomCode   = code;
      this._playerSlot = 'player2';

      this._setStatus('Unido a sala ' + code + '\nEsperando inicio...');
      this._codeDisplay.setText(code);

      this._subscribeToRoom();
    } catch (e) {
      console.error('[LOBBY] error al unirse:', e);
      this._setError('Error: ' + (e.message || String(e)));
      this._setStatus('');
    }
  }

  _subscribeToRoom() {
    var self = this;
    if (this._roomChannel) {
      supabaseClient.removeChannel(this._roomChannel);
    }
    this._roomChannel = RoomService.subscribeToRoom(this._roomId, function(payload) {
      if (payload.new && payload.new.status) {
        self._onRoomStatusChange(payload.new.status);
      }
    });
  }

  _onRoomStatusChange(status) {
    if (status === 'ready') {
      this._setStatus('AMBOS JUGADORES LISTOS\nIniciando...');
      // Dar un segundo para que ambos vean el mensaje
      var self = this;
      this.time.delayedCall(1200, function() {
        self._startOnlineGame();
      });
    } else if (status === 'finished') {
      this._setStatus('La sala ha terminado.');
      this._codeDisplay.setText('');
    }
  }

  _startOnlineGame() {
    // Limpiar inputs DOM antes de cambiar escena
    this._removeDomInputs();
    if (this._roomChannel) supabaseClient.removeChannel(this._roomChannel);

    // Inicializar sincronizacion
    OnlineSync.init(this._roomId, this._playerSlot, null);

    // Pasar datos a GameScene
    this.scene.start('GameScene', {
      playerCount:  2,
      onlineMode:   true,
      playerSlot:   this._playerSlot,
      playerName:   this._playerName,
      roomId:       this._roomId,
      roomCode:     this._roomCode,
    });
    this.scene.start('UIScene');
    this.scene.bringToTop('UIScene');
  }

  _goLocal() {
    this._removeDomInputs();
    this.scene.start('MenuScene');
  }

  // ── Scores ────────────────────────────────────────────────────────────

  async _loadScores() {
    try {
      var scores = await ScoreService.getRecentScores();
      if (!scores || scores.length === 0) {
        this._scoresContainer.setText('Sin registros aun.');
        return;
      }
      var lines = scores.map(function(s, i) {
        var d = new Date(s.created_at);
        var fecha = (d.getMonth()+1) + '/' + d.getDate();
        return (i+1) + '. ' + s.player_name.padEnd(10) + ' ' +
               String(s.score).padStart(6) + '  ' + fecha;
      });
      this._scoresContainer.setText(lines.join('\n'));
    } catch (e) {
      this._scoresContainer.setText('No se pudieron cargar scores.');
    }
  }

  // ── Helpers UI ─────────────────────────────────────────────────────────

  _makeButton(x, y, label, color) {
    var btn = this.add.text(x, y, label, {
      fontSize: '16px', fill: color, fontFamily: 'Courier New',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover',  function() { btn.setAlpha(0.7); });
    btn.on('pointerout',   function() { btn.setAlpha(1); });
    return btn;
  }

  _setStatus(msg) {
    if (this._statusText) this._statusText.setText(msg);
  }

  _setError(msg) {
    if (this._errorText) this._errorText.setText(msg);
  }

  _clearError() {
    if (this._errorText) this._errorText.setText('');
  }

  _getNameValue() {
    if (!this._nameInput) return '';
    var val = this._nameInput.value.trim();
    if (val.length < 2 || val.length > 12) {
      this._setError('Nombre: 2 a 12 caracteres.');
      return '';
    }
    this._clearError();
    return val.toUpperCase();
  }

  _getCodeValue() {
    if (!this._codeInput) return '';
    return this._codeInput.value.trim().replace(/\D/g, '').slice(0, 4);
  }

  /**
   * Crea un input HTML superpuesto sobre el canvas.
   * Phaser no tiene inputs de texto nativos, usamos DOM.
   */
  _createDomInput(x, y, width, height, placeholder) {
    // Obtener escala del canvas para posicionar correctamente
    var canvas  = this.sys.game.canvas;
    var rect    = canvas.getBoundingClientRect();
    var scaleX  = rect.width  / this.scale.width;
    var scaleY  = rect.height / this.scale.height;

    var input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = placeholder;
    input.maxLength   = 12;
    input.style.cssText = [
      'position:absolute',
      'left:'   + (rect.left + x * scaleX) + 'px',
      'top:'    + (rect.top  + y * scaleY) + 'px',
      'width:'  + (width  * scaleX) + 'px',
      'height:' + (height * scaleY) + 'px',
      'background:#001122',
      'color:#00ccff',
      'border:1px solid #00ccff',
      'font-family:Courier New,monospace',
      'font-size:' + Math.round(12 * scaleX) + 'px',
      'text-align:center',
      'outline:none',
      'z-index:100',
      'padding:2px',
    ].join(';');

    document.body.appendChild(input);
    if (!this._domInputs) this._domInputs = [];
    this._domInputs.push(input);
    return input;
  }

  _removeDomInputs() {
    if (!this._domInputs) return;
    this._domInputs.forEach(function(el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    this._domInputs = [];
  }

  // ── Fondo de estrellas ─────────────────────────────────────────────────

  _createStarfield() {
    var w = this.scale.width, h = this.scale.height;
    this._stars = [];
    for (var i = 0; i < 80; i++) {
      var star = this.add.image(
        Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), 'star'
      ).setScale(Phaser.Math.FloatBetween(0.3, 1.2))
       .setAlpha(Phaser.Math.FloatBetween(0.2, 0.7)).setDepth(0);
      this._stars.push({ img: star, speed: Phaser.Math.FloatBetween(0.3, 1.2) });
    }
  }

  update() {
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

  // Limpiar al salir de la escena
  shutdown() {
    this._removeDomInputs();
    if (this._roomChannel) {
      supabaseClient.removeChannel(this._roomChannel);
      this._roomChannel = null;
    }
  }
}
