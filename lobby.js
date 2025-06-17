import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- Supabase Setup ---
const supabaseUrl = "https://hxqvvsnhcpkqdjhdnupx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4cXZ2c25oY3BrcWRqaGRudXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDMyNTgsImV4cCI6MjA2NDc3OTI1OH0.bMEezL5ee2c1zGSOCUHcSu9Jls_sF1Kjqx5IvvuhYN4";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Wallet System ---
const BASE_URL = 'http://localhost:3000'; // Your backend URL
const AUTH_TOKEN = 'mocktoken'; // Your authentication token

class GameWallet {
  constructor() {
    this.userData = null;
    this.transactions = [];
  }

  async _makeRequest(endpoint, method = 'GET', body = null) {
    const headers = {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const options = {
      method,
      headers
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, options);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}\n` +
          `URL: ${BASE_URL}${endpoint}\n` +
          `Details: ${JSON.stringify(errorData)}`
        );
      }
      
      return await response.json();
    } catch (error) {
      console.error('API Error Details:', {
        endpoint,
        method,
        error: error.message,
        url: `${BASE_URL}${endpoint}`
      });
      throw new Error(`Network error: ${error.message}. Is the server running at ${BASE_URL}?`);
    }
  }

  async getUserInfo(chatId) {
    try {
      const response = await this._makeRequest(`/api/userinfo/get/${chatId}`);
      this.userData = response.userData;
      return this.userData;
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw error;
    }
  }

  async processDebit(transactionData) {
    try {
      const response = await this._makeRequest('/api/debit', 'POST', {
        user_id: transactionData.user_id,
        username: transactionData.username,
        transaction_type: 'debit',
        amount: transactionData.amount,
        game: transactionData.game,
        round_id: transactionData.round_id,
        transaction_id: transactionData.transaction_id
      });
      
      if (response.success && this.userData && this.userData.chatId === transactionData.user_id) {
        this.userData.balance = response.new_balance;
      }
      
      return response;
    } catch (error) {
      console.error('Debit transaction failed:', error);
      throw error;
    }
  }

  async processCredit(transactionData) {
    try {
      const response = await this._makeRequest('/api/credit', 'POST', {
        user_id: transactionData.user_id,
        username: transactionData.username,
        transaction_type: 'credit',
        amount: transactionData.amount,
        game: transactionData.game,
        round_id: transactionData.round_id,
        transaction_id: transactionData.transaction_id
      });
      
      if (response.success && this.userData && this.userData.chatId === transactionData.user_id) {
        this.userData.balance = response.new_balance;
      }
      
      return response;
    } catch (error) {
      console.error('Credit transaction failed:', error);
      throw error;
    }
  }

  async processRollback(transactionData) {
    try {
      const response = await this._makeRequest('/api/credit/rollback', 'POST', {
        user_id: transactionData.user_id,
        username: transactionData.username,
        transaction_type: 'rollback',
        amount: transactionData.amount,
        game: transactionData.game,
        round_id: transactionData.round_id,
        transaction_id: transactionData.transaction_id
      });
      
      if (response.success && this.userData && this.userData.chatId === transactionData.user_id) {
        this.userData.balance = response.new_balance;
      }
      
      return response;
    } catch (error) {
      console.error('Rollback transaction failed:', error);
      throw error;
    }
  }

  getBalance() {
    return this.userData ? this.userData.balance : 0;
  }
}

// --- Game Lobby ---
class ChessLobby {
  constructor() {
    this.wallet = new GameWallet();
    this.currentUser = null;
    this.supabase = supabase;
    this.supabaseChannel = null;
  }

  // --- DOM Elements ---
  get elements() {
    return {
      username: document.getElementById('username'),
      userAvatar: document.getElementById('user-avatar'),
      balanceAmount: document.getElementById('balance-amount'),
      createBetButtons: document.getElementById('create-bet-buttons'),
      createGameStatus: document.getElementById('create-game-status'),
      availableGamesList: document.getElementById('available-games-list'),
      gamesCount: document.getElementById('games-count'),
      refreshGamesBtn: document.getElementById('refresh-games-btn'),
      createGameBtn: document.getElementById('create-game-btn'),
      joinPrivateBtn: document.getElementById('join-private-btn'),
      privateGameCode: document.getElementById('private-game-code'),
      joinPrivateStatus: document.getElementById('join-private-status'),
      backBtn: document.getElementById('back-btn')
    };
  }

  // --- Initialization ---
  async initialize() {
    this.setupEventListeners();
    await this.loadUserDetails();
    this.setupBetButtons();
    await this.fetchAvailableGames();
    this.setupRealtimeUpdates();
  }

  // --- User Management ---
  async loadUserDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const startParam = urlParams.get('startapp');
    
    let userIdToInitialize = 'default_user'; // Fallback user ID
    
    if (startParam) {
      try {
        const userData = JSON.parse(decodeURIComponent(startParam));
        userIdToInitialize = userData.id.toString();
        
        // Get user info from wallet system
        this.currentUser = await this.wallet.getUserInfo(userIdToInitialize);
        
        // Merge Telegram data
        this.currentUser = {
          ...this.currentUser,
          username: userData.username || 
                   [userData.first_name, userData.last_name].filter(Boolean).join(' ') || 
                   `User${userData.id.toString().slice(-4)}`,
          telegramData: userData
        };
        
      } catch (error) {
        console.error('Error parsing user data:', error);
        this.currentUser = { 
          username: 'Guest', 
          balance: 0,
          chatId: 'guest_' + Math.random().toString(36).substring(2, 9)
        };
      }
    } else {
      console.log('No user data found - loading guest user');
      this.currentUser = { 
        username: 'Guest', 
        balance: 0,
        chatId: 'guest_' + Math.random().toString(36).substring(2, 9)
      };
    }
    
    this.updateUserUI();
  }

  updateUserUI() {
    const { username, userAvatar, balanceAmount } = this.elements;
    
    if (username) username.textContent = this.currentUser.username || 'Guest';
    if (balanceAmount) balanceAmount.textContent = this.formatBalance(this.currentUser.balance);
    if (userAvatar) {
      const initials = this.currentUser.username ? this.currentUser.username.charAt(0).toUpperCase() : 'U';
      userAvatar.textContent = initials;
      userAvatar.style.backgroundColor = this.generateAvatarColor(this.currentUser.username);
    }
  }

  // --- Utility Functions ---
  displayMessage(element, message, type = 'info') {
    if (!element) return;
    
    element.textContent = message;
    element.className = `status-message ${type}`;
    
    if (type === 'success') {
      setTimeout(() => {
        element.textContent = '';
        element.className = 'status-message';
      }, 3000);
    }
  }

  formatBalance(amount) {
    return amount?.toLocaleString() + ' ETB' || '0 ETB';
  }

  generateAvatarColor(username) {
    if (!username) return '#6c757d';
    const colors = [
      '#ff6b6b', '#51cf66', '#fcc419', '#228be6', 
      '#be4bdb', '#20c997', '#fd7e14', '#868e96'
    ];
    const hash = username.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    return colors[hash % colors.length];
  }

  formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return `${interval}y ago`;
    
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return `${interval}mo ago`;
    
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return `${interval}d ago`;
    
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return `${interval}h ago`;
    
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return `${interval}m ago`;
    
    return 'Just now';
  }

  // --- Game Creation ---
  setupBetButtons() {
    const { createBetButtons } = this.elements;
    const betOptions = [10, 25, 50, 100, 250,500];
    
    createBetButtons.innerHTML = '';
    
    betOptions.forEach(bet => {
      const button = document.createElement('button');
      button.textContent = `${bet} ETB`;
      button.classList.add('bet-button');
      
      if (this.currentUser.balance < bet) {
        button.disabled = true;
        button.classList.add('disabled');
      }
      
      button.addEventListener('click', () => {
        document.querySelectorAll('.bet-button').forEach(btn => {
          btn.classList.remove('active');
        });
        button.classList.add('active');
        this.selectedBet = bet;
      });
      
      createBetButtons.appendChild(button);
    });

    document.getElementById('private-game-toggle')?.addEventListener('change', (e) => {
      this.isPrivateGame = e.target.checked;
    });
  }

  async createGame(bet) {
    if (!this.validateGameCreation(bet)) return;

    const { createGameStatus } = this.elements;
    this.displayMessage(createGameStatus, 'Creating game...', 'info');

    try {
      // First process the debit transaction
      const transactionId = `CHESS_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const roundId = `CHESS_${Date.now()}`;
      
      const debitResult = await this.wallet.processDebit({
        user_id: this.currentUser.chatId,
        username: this.currentUser.username,
        amount: bet,
        game: 'chess',
        round_id: roundId,
        transaction_id: transactionId
      });

      if (!debitResult.success) {
        throw new Error('Failed to process bet amount');
      }

      // Now create the game in Supabase
      const gameCode = this.generateGameCode();
      const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      
      const gameData = {
        code: gameCode,
        white_username: this.currentUser.username,
        white_phone: this.currentUser.chatId,
        bet: bet,
        fen: initialFen,
        turn: 'white',
        status: 'waiting',
        is_private: this.isPrivateGame,
        transaction_id: transactionId
      };

      // Add Telegram fields if available
      if (this.currentUser.telegramData) {
        gameData.white_telegram_id = this.currentUser.telegramData.id;
        gameData.white_telegram_username = this.currentUser.telegramData.username;
      }

      const { data: createdGameData, error } = await this.supabase
        .from('chess_games')
        .insert([gameData])
        .select()
        .single();

      if (error) {
        // If Supabase fails, rollback the transaction
        await this.wallet.processRollback({
          user_id: this.currentUser.chatId,
          username: this.currentUser.username,
          amount: bet,
          game: 'chess',
          round_id: roundId,
          transaction_id: transactionId
        });
        throw error;
      }

      window.location.href = `${window.location.origin}/chess.HTML?code=${createdGameData.code}&color=white`;
    } catch (error) {
      console.error('Error creating game:', error);
      this.displayMessage(createGameStatus, error.message || 'Failed to create game', 'error');
    }
  }

  validateGameCreation(bet) {
    const { createGameStatus } = this.elements;
    
    if (!bet || isNaN(bet)) {
      this.displayMessage(createGameStatus, 'Invalid bet amount', 'error');
      return false;
    }

    if (this.currentUser.balance < bet) {
      this.displayMessage(createGameStatus, 'Insufficient balance', 'error');
      return false;
    }

    return true;
  }

  generateGameCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // --- Game Listing ---
  async fetchAvailableGames() {
    try {
      const { data, error } = await this.supabase
        .from('chess_games')
        .select(`
          code, 
          white_username, 
          bet,
          created_at,
          is_private
        `)
        .eq('status', 'waiting')
        .eq('is_private', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.displayAvailableGames(data || []);
      this.updateGamesCount(data?.length || 0);
    } catch (error) {
      console.error("Error fetching available games:", error);
      const { createGameStatus } = this.elements;
      this.displayMessage(createGameStatus, 'Failed to load games', 'error');
    }
  }

  displayAvailableGames(games) {
    const { availableGamesList } = this.elements;
    if (!availableGamesList) return;

    availableGamesList.innerHTML = '';

    if (!games.length) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'no-games';
      emptyItem.textContent = 'No games available yet. Create one!';
      availableGamesList.appendChild(emptyItem);
      return;
    }

    games.forEach(game => {
      const gameItem = document.createElement('li');
      gameItem.className = 'game-item';
      
      gameItem.innerHTML = `
        <div class="game-info">
          <div class="game-creator">
            <div class="creator-avatar" style="background-color: ${this.generateAvatarColor(game.white_username)}">
              ${game.white_username?.charAt(0) || 'C'}
            </div>
            <span class="creator-name">${game.white_username || 'Anonymous'}</span>
          </div>
          <div class="game-details">
            <div class="game-detail">
              <span class="material-icons" style="font-size: 16px;">attach_money</span>
              <span>${game.bet} ETB</span>
            </div>
            <div class="game-detail game-code">
              <span class="material-icons" style="font-size: 16px;">code</span>
              <span>${game.code}</span>
            </div>
            <div class="game-detail">
              <span class="material-icons" style="font-size: 16px;">schedule</span>
              <span class="time-ago">${this.formatTimeAgo(game.created_at)}</span>
            </div>
          </div>
        </div>
        <button class="join-btn" data-game-code="${game.code}" data-bet="${game.bet}">
          <span class="material-icons" style="font-size: 16px;">login</span>
          Join
        </button>
      `;

      availableGamesList.appendChild(gameItem);
    });

    document.querySelectorAll('.join-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const gameCode = button.dataset.gameCode;
        const gameBet = parseInt(button.dataset.bet);
        await this.joinGame(gameCode, gameBet);
      });
    });
  }

  updateGamesCount(count) {
    const { gamesCount } = this.elements;
    if (gamesCount) {
      gamesCount.textContent = count;
      gamesCount.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  // --- Game Joining ---
  async joinGame(gameCode, gameBet) {
    if (!this.validateJoinGame(gameBet)) return;

    const { createGameStatus } = this.elements;
    this.displayMessage(createGameStatus, 'Joining game...', 'info');

    try {
      // First process the debit transaction
      const transactionId = `CHESS_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const roundId = `CHESS_${Date.now()}`;
      
      const debitResult = await this.wallet.processDebit({
        user_id: this.currentUser.chatId,
        username: this.currentUser.username,
        amount: gameBet,
        game: 'chess',
        round_id: roundId,
        transaction_id: transactionId
      });

      if (!debitResult.success) {
        throw new Error('Failed to process bet amount');
      }

      // Now join the game in Supabase
      const updateData = {
        black_phone: this.currentUser.chatId,
        black_username: this.currentUser.username,
        status: 'ongoing',
        transaction_id: transactionId
      };

      // Add Telegram fields if available
      if (this.currentUser.telegramData) {
        updateData.black_telegram_id = this.currentUser.telegramData.id;
        updateData.black_telegram_username = this.currentUser.telegramData.username;
      }

      const { error: joinError } = await this.supabase
        .from('chess_games')
        .update(updateData)
        .eq('code', gameCode);

      if (joinError) {
        // If Supabase fails, rollback the transaction
        await this.wallet.processRollback({
          user_id: this.currentUser.chatId,
          username: this.currentUser.username,
          amount: gameBet,
          game: 'chess',
          round_id: roundId,
          transaction_id: transactionId
        });
        throw joinError;
      }

      window.location.href = `${window.location.origin}/chess.HTML?code=${gameCode}&color=black`;
    } catch (error) {
      console.error('Error joining game:', error);
      this.displayMessage(createGameStatus, error.message || 'Failed to join game', 'error');
    }
  }

  validateJoinGame(gameBet) {
    const { createGameStatus } = this.elements;
    
    if (this.currentUser.balance < gameBet) {
      this.displayMessage(createGameStatus, 'Insufficient balance', 'error');
      return false;
    }
    return true;
  }

  // --- Private Game Joining ---
  async handleJoinPrivateGame() {
    const { privateGameCode, joinPrivateStatus } = this.elements;
    const gameCode = privateGameCode.value.trim();
    
    if (!gameCode) {
      this.displayMessage(joinPrivateStatus, 'Please enter a game code', 'error');
      return;
    }

    try {
      this.displayMessage(joinPrivateStatus, 'Checking game...', 'info');
      
      const { data: gameData, error: fetchError } = await this.supabase
        .from('chess_games')
        .select('white_username, black_username, bet, is_private, status')
        .eq('code', gameCode)
        .single();

      if (fetchError) throw fetchError;
      if (!gameData) throw new Error('Game not found');
      if (gameData.status !== 'waiting') throw new Error('Game is not available');
      
      await this.joinGame(gameCode, gameData.bet);
    } catch (error) {
      console.error('Error joining private game:', error);
      this.displayMessage(joinPrivateStatus, error.message || 'Failed to join private game', 'error');
    }
  }

  // --- Realtime Updates ---
  setupRealtimeUpdates() {
    if (this.supabaseChannel) {
      this.supabaseChannel.unsubscribe();
    }

    this.supabaseChannel = this.supabase
      .channel('chess_games_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chess_games'
        },
        () => {
          this.fetchAvailableGames();
        }
      )
      .subscribe();
  }

  // --- Event Listeners ---
  setupEventListeners() {
    const { 
      refreshGamesBtn, 
      createGameBtn, 
      joinPrivateBtn, 
      privateGameCode,
      backBtn
    } = this.elements;

    refreshGamesBtn?.addEventListener('click', () => this.fetchAvailableGames());
    joinPrivateBtn?.addEventListener('click', () => this.handleJoinPrivateGame());
    privateGameCode?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleJoinPrivateGame();
      }
    });

    createGameBtn?.addEventListener('click', () => {
      if (!this.selectedBet) {
        const { createGameStatus } = this.elements;
        this.displayMessage(createGameStatus, 'Please select a bet amount', 'error');
        return;
      }
      this.createGame(this.selectedBet);
    });

    backBtn?.addEventListener('click', () => {
      window.location.href = 'home.html';
    });
  }
}

// Initialize the lobby when the page loads
document.addEventListener('DOMContentLoaded', () => {
  const lobby = new ChessLobby();
  lobby.initialize();
});