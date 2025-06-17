const BASE_URL = 'http://localhost:3000'; // Mock server URL
const AUTH_TOKEN = 'mocktoken'; // Mock authentication token

class GameWallet {
  constructor() {
    this.userData = null;
    this.transactions = [];
  }

  // Helper method for API calls
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

  // Get user details
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

  // Process debit transaction
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
      
      // Update local balance if successful
      if (response.success && this.userData && this.userData.chatId === transactionData.user_id) {
        this.userData.balance = response.new_balance;
      }
      
      return response;
    } catch (error) {
      console.error('Debit transaction failed:', error);
      throw error;
    }
  }

  // Process credit transaction
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
      
      // Update local balance if successful
      if (response.success && this.userData && this.userData.chatId === transactionData.user_id) {
        this.userData.balance = response.new_balance;
      }
      
      return response;
    } catch (error) {
      console.error('Credit transaction failed:', error);
      throw error;
    }
  }

  // Process rollback transaction
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
      
      // Update local balance if successful
      if (response.success && this.userData && this.userData.chatId === transactionData.user_id) {
        this.userData.balance = response.new_balance;
      }
      
      return response;
    } catch (error) {
      console.error('Rollback transaction failed:', error);
      throw error;
    }
  }

  // Get current balance
  getBalance() {
    return this.userData ? this.userData.balance : 0;
  }
}

class GameLobby {
  constructor() {
    this.wallet = new GameWallet();
    this.currentUser = null;
  }

  async initialize(chatId) {
    try {
      this.currentUser = await this.wallet.getUserInfo(chatId);
      console.log('User initialized:', this.currentUser);
      
      // Parse additional user data from URL if available
      const urlParams = new URLSearchParams(window.location.search);
      const startappParam = urlParams.get('startapp');
      
      if (startappParam) {
        try {
          const urlUserData = JSON.parse(decodeURIComponent(startappParam));
          // Merge URL user data with wallet data
          this.currentUser = {
            ...this.currentUser,
            firstName: urlUserData.first_name,
            lastName: urlUserData.last_name
          };
        } catch (e) {
          console.error('Error parsing URL user data:', e);
        }
      }
      
      this.updateUI();
    } catch (error) {
      this.showError(`Initialization failed: ${error.message}`);
    }
  }

  updateUI() {
    if (!this.currentUser) {
      this.showError("No user data available");
      return;
    }

    // Safe element updates with null checks
    this.updateElement('firstName', this.currentUser.firstName || '-');
    this.updateElement('lastName', this.currentUser.lastName || '-');
    this.updateElement('username', this.currentUser.username || '-');
    this.updateElement('balance', this.currentUser.balance || '0');
    this.updateElement('phone', this.currentUser.phoneNumber || '-');
  }

  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    } else {
      console.warn(`Element with ID ${id} not found`);
    }
  }

  showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
      errorElement.textContent = message;
    }
    console.error(message);
  }

  async joinGame(gameName, entryFee) {
    if (!this.currentUser) {
      this.showError('User not initialized');
      return false;
    }

    if (this.wallet.getBalance() < entryFee) {
      this.showError('Insufficient balance');
      return false;
    }

    try {
      const transactionId = `TXN_${Date.now()}_DEBIT_${Math.floor(Math.random() * 1000)}`;
      const roundId = `ROUND_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      const result = await this.wallet.processDebit({
        user_id: this.currentUser.chatId,
        username: this.currentUser.username,
        amount: entryFee,
        game: gameName,
        round_id: roundId,
        transaction_id: transactionId
      });

      console.log('Game joined successfully:', result);
      this.updateUI();
      return true;
    } catch (error) {
      this.showError(`Failed to join game: ${error.message}`);
      return false;
    }
  }

  async processWin(amount, gameName) {
    if (!this.currentUser) {
      this.showError('User not initialized');
      return false;
    }

    try {
      const transactionId = `TXN_${Date.now()}_CREDIT_${Math.floor(Math.random() * 1000)}`;
      const roundId = `ROUND_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      const result = await this.wallet.processCredit({
        user_id: this.currentUser.chatId,
        username: this.currentUser.username,
        amount: amount,
        game: gameName,
        round_id: roundId,
        transaction_id: transactionId
      });

      console.log('Win processed successfully:', result);
      this.updateUI();
      return true;
    } catch (error) {
      this.showError(`Failed to process win: ${error.message}`);
      return false;
    }
  }

  async cancelGame(amount, gameName) {
    if (!this.currentUser) {
      this.showError('User not initialized');
      return false;
    }

    try {
      const transactionId = `TXN_${Date.now()}_ROLLBACK_${Math.floor(Math.random() * 1000)}`;
      const roundId = `ROUND_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      const result = await this.wallet.processRollback({
        user_id: this.currentUser.chatId,
        username: this.currentUser.username,
        amount: amount,
        game: gameName,
        round_id: roundId,
        transaction_id: transactionId
      });

      console.log('Game cancelled successfully:', result);
      this.updateUI();
      return true;
    } catch (error) {
      this.showError(`Failed to cancel game: ${error.message}`);
      return false;
    }
  }
}

// Initialize the lobby when the page loads
document.addEventListener('DOMContentLoaded', () => {
  const lobby = new GameLobby();
  
  // Verify all required elements exist before setting up event listeners
  const requiredElements = ['joinBingo', 'simulateWin', 'cancelGame', 'refreshBalance'];
  const missingElements = requiredElements.filter(id => !document.getElementById(id));
  
  if (missingElements.length > 0) {
    console.error('Missing required elements:', missingElements);
    return;
  }

  // Parse user ID from URL or use default
  const urlParams = new URLSearchParams(window.location.search);
  const startappParam = urlParams.get('startapp');
  let userIdToInitialize = '1133538088'; // Default to KB's user
  
  if (startappParam) {
    try {
      const userData = JSON.parse(decodeURIComponent(startappParam));
      userIdToInitialize = userData.id.toString();
    } catch (e) {
      console.error('Error parsing startapp parameter:', e);
    }
  }
  
  // Initialize lobby
  lobby.initialize(userIdToInitialize);
  
  // Set up event listeners
  document.getElementById('joinBingo').addEventListener('click', async () => {
    const success = await lobby.joinGame('Bingo', 1000);
    if (success) {
      alert('Successfully joined Bingo game!');
    }
  });
  
  document.getElementById('simulateWin').addEventListener('click', async () => {
    const success = await lobby.processWin(2500, 'Bingo');
    if (success) {
      alert('Win processed! Check your new balance.');
    }
  });
  
  document.getElementById('cancelGame').addEventListener('click', async () => {
    const success = await lobby.cancelGame(1000, 'Bingo');
    if (success) {
      alert('Game cancelled and funds returned.');
    }
  });
  
  document.getElementById('refreshBalance').addEventListener('click', () => {
    lobby.updateUI();
    alert('Balance refreshed!');
  });
});