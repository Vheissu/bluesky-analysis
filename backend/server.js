const express = require('express');
const cors = require('cors');
const { followEmitter, getFollowers, statements } = require('./stream');
const { 
  login, 
  fetchFollowers, 
  fetchPosts, 
  analyzeActivity, 
  calculateAverageActiveTime, 
  findOptimalPostingWindow,
  formatHour 
} = require('./analyze');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://localhost:9000'
}));

app.use(express.json());

// Debug endpoint to check database state
app.get('/api/debug/db', (req, res) => {
  try {
    const followerCount = statements.getFollowerCount.get().count;
    const eventCount = statements.getEventCount.get().count;
    const sampleFollowers = statements.getAllFollowers.all().slice(0, 5);
    const sampleEvents = statements.getRecentEvents.all({
      limit: 5,
      offset: 0
    });
    
    res.json({
      followerCount,
      eventCount,
      sampleFollowers,
      sampleEvents
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all followers
app.get('/api/followers', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Get total count
    const total = statements.getFollowerCount.get().count;

    // Get paginated followers
    const followers = statements.getPaginatedFollowers.all({
      limit,
      offset
    });

    // Convert to the expected format, but only for this page
    const followersMap = followers.reduce((acc, follower) => {
      acc[follower.did] = {
        handle: follower.handle,
        displayName: follower.display_name,
        avatar: follower.avatar,
        description: follower.description,
        indexedAt: follower.indexed_at
      };
      return acc;
    }, {});

    res.json({
      followers: followersMap,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

// Get recent events with pagination
app.get('/api/events', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // First, get the total count
    const total = statements.getEventCount.get().count;

    // Then get the paginated events
    // Make sure we're passing the parameters in the correct order
    const events = statements.getRecentEvents.all({
      limit,
      offset
    });

    res.json({
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// WebSocket setup for real-time updates
const { Server } = require('ws');
const server = require('http').createServer(app);
const wss = new Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');

  // Send initial page of followers (first 20)
  const initialFollowers = statements.getPaginatedFollowers.all({
    limit: 20,
    offset: 0
  }).reduce((acc, follower) => {
    acc[follower.did] = {
      handle: follower.handle,
      displayName: follower.display_name,
      avatar: follower.avatar,
      description: follower.description,
      indexedAt: follower.indexed_at
    };
    return acc;
  }, {});

  const total = statements.getFollowerCount.get().count;

  // Send initial state
  ws.send(JSON.stringify({ 
    type: 'initial_state', 
    data: {
      followers: initialFollowers,
      pagination: {
        page: 1,
        limit: 20,
        total,
        totalPages: Math.ceil(total / 20)
      }
    }
  }));

  // Listen for new follow events
  const handleFollowEvent = (eventData) => {
    // Only send the individual follow/unfollow event
    console.log('Sending follow event:', eventData);
    ws.send(JSON.stringify({ 
      type: 'follower_update',
      action: eventData.type, // 'follow' or 'unfollow'
      data: {
        did: eventData.did,
        handle: eventData.handle,
        displayName: eventData.displayName,
        avatar: eventData.avatar,
        description: eventData.description,
        timestamp: eventData.timestamp
      }
    }));
  };

  followEmitter.on('followEvent', handleFollowEvent);

  // Handle client messages (e.g., pagination requests)
  ws.on('message', async (message) => {
    try {
      const request = JSON.parse(message);
      
      if (request.type === 'get_followers_page') {
        const { page, limit } = request;
        const offset = (page - 1) * limit;
        
        const followers = statements.getPaginatedFollowers.all({
          limit,
          offset
        }).reduce((acc, follower) => {
          acc[follower.did] = {
            handle: follower.handle,
            displayName: follower.display_name,
            avatar: follower.avatar,
            description: follower.description,
            indexedAt: follower.indexed_at
          };
          return acc;
        }, {});

        ws.send(JSON.stringify({
          type: 'followers_page',
          data: {
            followers,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit)
            }
          }
        }));
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    followEmitter.off('followEvent', handleFollowEvent);
    console.log('Client disconnected from WebSocket');
  });
});

// Start the server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = server; 

app.get('/api/analysis', async (req, res) => {
  try {
    await login();
    const sampledFollowers = await fetchFollowers();
    
    const allPosts = [];
    for (const follower of sampledFollowers) {
      const posts = await fetchPosts(follower.handle);
      allPosts.push(...posts);
    }

    const activity = analyzeActivity(allPosts);
    const averageActiveTime = calculateAverageActiveTime(activity);
    const peakHours = findOptimalPostingWindow(activity);

    // Format the hourly activity for the frontend
    const hourlyActivity = activity.map((count, hour) => ({
      hour: formatHour(hour),
      count
    })).filter(item => item.count > 0);

    res.json({
      averageActiveTime,
      peakHours,
      hourlyActivity
    });
  } catch (error) {
    console.error('Error generating analysis:', error);
    res.status(500).json({ error: 'Failed to generate analysis' });
  }
}); 