const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://hxqvvsnhcpkqdjhdnupx.supabase.co',
  process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4cXZ2c25oY3BrcWRqaGRudXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDMyNTgsImV4cCI6MjA2NDc3OTI1OH0.bMEezL5ee2c1zGSOCUHcSu9Jls_sF1Kjqx5IvvuhYN4'
);

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const authToken = req.headers['admin-token'];
  if (authToken === 'f9b1c74d59e543eabc76f74f9de3a3b85a0c1b740b5117d2b5760c7b47e9e812') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Get game statistics
// Helper functions for date ranges
const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getThisWeekRange = () => {
  const start = new Date();
  start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getDateRange = (days) => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Common stats calculation function
const calculateStats = (games) => ({
  total: games.length,
  active: games.filter(g => g.status === 'ongoing').length,
  finished: games.filter(g => 
    g.status === 'finished' && 
    ['checkmate', 'disconnect', 'draw'].includes(g.result)
  ).length,
  waiting: games.filter(g => g.status === 'waiting').length,
  abandoned: games.filter(g => g.result === 'abandoned').length,
  totalBetAmount: games.reduce((sum, game) => sum + (game.bet || 0), 0),
  byResult: {
    checkmate: games.filter(g => g.result === 'checkmate').length,
    disconnect: games.filter(g => g.result === 'disconnect').length,
    draw: games.filter(g => g.result === 'draw').length,
    abandoned: games.filter(g => g.result === 'abandoned').length,
    other: games.filter(g => 
      g.status === 'finished' && 
      !['checkmate', 'disconnect', 'draw', 'abandoned'].includes(g.result)
    ).length
  }
});

// Today's stats endpoint
app.get('/admin/stats/today', authenticateAdmin, async (req, res) => {
  try {
    const { start, end } = getTodayRange();
    
    const { data: games, error } = await supabase
      .from('chess_games')
      .select('status, created_at, updated_at, bet, result')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (error) throw error;

    res.json({
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      ...calculateStats(games)
    });
  } catch (err) {
    console.error('Error fetching today\'s stats:', err);
    res.status(500).json({ error: 'Failed to fetch today\'s statistics' });
  }
});

// This week's stats endpoint
app.get('/admin/stats/week', authenticateAdmin, async (req, res) => {
  try {
    const { start, end } = getThisWeekRange();
    
    const { data: games, error } = await supabase
      .from('chess_games')
      .select('status, created_at, updated_at, bet, result')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (error) throw error;

    res.json({
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      ...calculateStats(games)
    });
  } catch (err) {
    console.error('Error fetching weekly stats:', err);
    res.status(500).json({ error: 'Failed to fetch weekly statistics' });
  }
});

// Last N days stats endpoint
app.get('/admin/stats/last/:days', authenticateAdmin, async (req, res) => {
  try {
    const days = parseInt(req.params.days);
    if (isNaN(days) || days < 1) {
      return res.status(400).json({ error: 'Invalid days parameter' });
    }

    const { start, end } = getDateRange(days);
    
    const { data: games, error } = await supabase
      .from('chess_games')
      .select('status, created_at, updated_at, bet, result')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (error) throw error;

    res.json({
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
        days: days
      },
      ...calculateStats(games)
    });
  } catch (err) {
    console.error('Error fetching stats for last N days:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// All-time stats endpoint (kept for backward compatibility)
app.get('/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const { data: games, error } = await supabase
      .from('chess_games')
      .select('status, created_at, updated_at, bet, result');

    if (error) throw error;

    res.json({
      dateRange: 'all-time',
      ...calculateStats(games)
    });
  } catch (err) {
    console.error('Error fetching all-time stats:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get active game details
// Updated /admin/active-games endpoint
app.get('/admin/active-games', authenticateAdmin, async (req, res) => {
  try {
    const { data: games, error } = await supabase
      .from('chess_games')
      .select(`
        code,
        status,
        bet,
        turn,
        white_username,
        black_username,
        created_at,
        updated_at,
        fen
      `)
      .eq('status', 'ongoing');

    if (error) throw error;

    const activeGames = games.map(game => ({
      gameCode: game.code,
      betAmount: game.bet,
      currentTurn: game.turn,
      whitePlayer: game.white_username,
      blackPlayer: game.black_username,
      lastMoveTime: game.updated_at,
      gameDuration: Math.floor((new Date() - new Date(game.created_at)) / 60000) + ' minutes',
      currentPosition: game.fen
    }));

    res.json(activeGames);
  } catch (err) {
    console.error('Error fetching active games:', err);
    res.status(500).json({ error: 'Failed to fetch active games' });
  }
});

// Updated /admin/finished-games endpoint
app.get('/admin/finished-games', authenticateAdmin, async (req, res) => {
  try {
    const { data: games, error } = await supabase
      .from('chess_games')
      .select(`
        code,
        status,
        bet,
        winner,
        result,
        white_username,
        black_username,
        created_at,
        updated_at
      `)
      .eq('status', 'finished')
      .in('result', ['checkmate', 'disconnect', 'draw']) // Only these results
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const finishedGames = games.map(game => ({
      gameCode: game.code,
      betAmount: game.bet,
      winner: game.winner,
      result: game.result,
      whitePlayer: game.white_username,
      blackPlayer: game.black_username,
      gameDuration: Math.floor((new Date(game.updated_at) - new Date(game.created_at)) / 60000) + ' minutes',
      endedAt: game.updated_at
    }));

    res.json(finishedGames);
  } catch (err) {
    console.error('Error fetching finished games:', err);
    res.status(500).json({ error: 'Failed to fetch finished games' });
  }
});
// Get abandoned games
app.get('/admin/abandoned-games', authenticateAdmin, async (req, res) => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: games, error } = await supabase
      .from('chess_games')
      .select(`
        code,
        status,
        bet,
        turn,
        white_username,
        black_username,
        created_at,
        updated_at,
        result
      `)
      .eq('status', 'finished')
      .lt('updated_at', thirtyMinutesAgo)
      .neq('result', 'abandoned'); // Exclude already marked as abandoned

    if (error) throw error;

    const abandonedGames = games.map(game => ({
      gameCode: game.code,
      betAmount: game.bet,
      lastTurn: game.turn,
      whitePlayer: game.white_username,
      blackPlayer: game.black_username,
      lastActivity: game.updated_at
      
    }));

    res.json(abandonedGames);
  } catch (err) {
    console.error('Error fetching abandoned games:', err);
    res.status(500).json({ error: 'Failed to fetch abandoned games' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
});
