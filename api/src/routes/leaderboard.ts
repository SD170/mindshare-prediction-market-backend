import { Router } from 'express';
import { LeaderboardEntry } from '../db';
import { getDateOnly } from '../utils/constants';

const router = Router();

// Helper: Get leaderboard for a specific date (highest index)
async function getLeaderboardForDate(date: Date): Promise<any[]> {
  const dateOnly = getDateOnly(date);
  
  // Find the highest index for this date
  const maxIndexDoc = await LeaderboardEntry.findOne({ date: dateOnly })
    .sort({ index: -1 })
    .select('index')
    .lean();
  
  if (!maxIndexDoc) {
    return [];
  }
  
  const maxIndex = maxIndexDoc.index;
  
  // Get all entries for this date and index, sorted by rank
  const entries = await LeaderboardEntry.find({ date: dateOnly, index: maxIndex })
    .sort({ rank: 1 })
    .lean();
  
  return entries;
}

router.get('/today', async (req, res) => {
  const today = getDateOnly(new Date());
  const entries = await getLeaderboardForDate(today);
  res.json(entries);
});

router.get('/yesterday', async (req, res) => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const entries = await getLeaderboardForDate(yesterday);
  res.json(entries);
});

router.get('/date', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
  }
  
  try {
    const targetDate = new Date(date as string);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    const entries = await getLeaderboardForDate(targetDate);
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/snapshot', async (req, res) => {
  try {
    const { date, entries } = req.body;
    
    if (!date || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) and entries array required' });
    }
    
    const dateOnly = getDateOnly(new Date(date));
    
    // Find the highest index for this date
    const maxIndexDoc = await LeaderboardEntry.findOne({ date: dateOnly })
      .sort({ index: -1 })
      .select('index')
      .lean();
    
    const nextIndex = maxIndexDoc ? maxIndexDoc.index + 1 : 0;
    
    // Delete any existing entries for this date/index (handle retries)
    await LeaderboardEntry.deleteMany({ date: dateOnly, index: nextIndex });
    
    // Insert new entries - remove _id to let MongoDB generate new ones
    const leaderboardEntries = entries.map((entry: any) => {
      const { _id, ...entryWithoutId } = entry;
      return {
        ...entryWithoutId,
        date: dateOnly,
        index: nextIndex,
      };
    });
    
    await LeaderboardEntry.insertMany(leaderboardEntries);
    
    console.log(`✅ Saved leaderboard snapshot: ${dateOnly.toISOString().split('T')[0]}, index ${nextIndex}, ${entries.length} projects`);
    
    res.json({
      success: true,
      date: dateOnly.toISOString().split('T')[0],
      index: nextIndex,
      count: entries.length,
    });
  } catch (error: any) {
    console.error('Error saving leaderboard snapshot:', error);
    res.status(500).json({ error: error.message || 'Failed to save snapshot' });
  }
});

export default router;

