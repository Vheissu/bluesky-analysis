const { AtpAgent } = require('@atproto/api');
const WebSocket = require('ws');
const cbor = require('cbor');
const fs = require('fs');
require('dotenv').config();
const { db, statements } = require('./db');
const path = require('path');
const EventEmitter = require('events');

let CID;
(async () => {
  const multiformats = await import('multiformats');
  CID = multiformats.CID;
})();

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getFollowers(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  
  return statements.getPaginatedFollowers.all({
    limit,
    offset
  }).reduce((acc, row) => {
    acc[row.did] = {
      handle: row.handle,
      displayName: row.display_name,
      avatar: row.avatar,
      description: row.description,
      indexedAt: row.indexed_at
    };
    return acc;
  }, {});
}

function persistFollower(did, followerData) {
  statements.insertFollower.run(
    did,
    followerData.handle,
    followerData.displayName,
    followerData.avatar,
    followerData.description,
    followerData.indexedAt
  );
}

function persistEvent(eventData) {
  statements.insertEvent.run(
    eventData.type,
    eventData.did,
    eventData.handle,
    eventData.displayName,
    eventData.timestamp,
    eventData.createdAt,
    eventData.path,
    eventData.avatar,
    eventData.description
  );
  
  // Emit only the event data needed for real-time updates
  followEmitter.emit('followEvent', {
    type: eventData.type,
    did: eventData.did,
    handle: eventData.handle,
    displayName: eventData.displayName,
    avatar: eventData.avatar,
    description: eventData.description,
    timestamp: eventData.timestamp
  });
}

// Initialize Atproto Agent
const agent = new AtpAgent({ service: 'https://bsky.social' });

async function carReader(blocks) {
  const { CarReader } = await import('@ipld/car');
  try {
    // Ensure blocks is a Buffer
    const blockBuffer = Buffer.isBuffer(blocks) ? blocks : Buffer.from(blocks);
    return await CarReader.fromBytes(blockBuffer);
  } catch (error) {
    console.error('CAR reader error:', error);
    console.error('Blocks type:', typeof blocks);
    console.error('Blocks length:', blocks?.length);
    throw error;
  }
}

async function decodeCid(cidData) {
  try {
    if (!CID) {
      const multiformats = await import('multiformats');
      CID = multiformats.CID;
    }

    if (cidData && cidData.tag === 42) {
      const buffer = cidData.value;
      
      // AT Protocol uses a specific format:
      // [0x00, 0x01, 0x71] prefix
      // [0x12, 0x20] multihash header (SHA-256)
      // [...] actual hash bytes
      if (buffer[0] === 0x00 && buffer[1] === 0x01 && buffer[2] === 0x71) {
        // Use the entire multihash portion (header + digest)
        const multihashBytes = buffer.slice(3);
        
        // Create CID directly from the components
        return CID.decode(Buffer.concat([
          Buffer.from([0x01, 0x71]), // version 1, dag-cbor codec
          multihashBytes
        ]));
      }
    }

    console.log('Unexpected CID format:', {
      type: typeof cidData,
      isTagged: cidData?.tag !== undefined,
      tag: cidData?.tag,
      valueType: cidData?.value ? typeof cidData.value : 'undefined',
      isBuffer: Buffer.isBuffer(cidData?.value),
      bufferHex: Buffer.isBuffer(cidData?.value) ? cidData.value.toString('hex') : null
    });

    throw new Error('Unsupported CID format');
  } catch (error) {
    console.error('CID decode error details:', {
      error: error.message,
      cidDataType: typeof cidData,
      cidValue: cidData?.value ? {
        type: typeof cidData.value,
        isBuffer: Buffer.isBuffer(cidData.value),
        hexValue: Buffer.isBuffer(cidData.value) ? cidData.value.toString('hex') : null,
        multihashHeader: Buffer.isBuffer(cidData.value) ? 
          `0x${cidData.value.slice(3, 5).toString('hex')}` : null,
        digestSize: Buffer.isBuffer(cidData.value) ? cidData.value.length - 5 : null
      } : null
    });
    throw error;
  }
}

async function authenticate() {
  console.log('Authenticating...');
  await agent.login({
    identifier: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_PASSWORD,
  });
  console.log('Authenticated successfully.');
}

let isInitialFetchComplete = false;

async function fetchInitialFollowers() {
  console.log('Fetching initial followers...');
  const myDid = agent.session.did;
  let cursor;
  const currentFollowers = new Map();

  try {
    do {
      const response = await agent.getFollowers({ actor: myDid, cursor });
      for (const follow of response.data.followers) {
        const followerData = {
          handle: follow.handle,
          displayName: follow.displayName || '',
          avatar: follow.avatar || '',
          description: follow.description || '',
          indexedAt: new Date().toISOString()
        };
        currentFollowers.set(follow.did, followerData);
      }
      cursor = response.data.cursor;
    } while (cursor);

    // Get existing followers from database
    const existingFollowers = getFollowers();
    const lastCheck = statements.getLastCheck.get()?.value;
    const hadExistingFollowers = Object.keys(existingFollowers).length > 0;
    
    if (hadExistingFollowers) {
      let newFollowerCount = 0;
      
      // Compare with stored followers and create events for new ones
      for (const [did, data] of currentFollowers.entries()) {
        if (!existingFollowers[did]) {
          persistFollower(did, data);
          persistEvent({
            type: 'follow',
            did,
            handle: data.handle,
            displayName: data.displayName,
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),
            path: '',
            avatar: data.avatar,
            description: data.description
          });
          newFollowerCount++;
        }
      }

      // If we have a last check time, report the changes since then
      if (lastCheck) {
        const lastCheckDate = new Date(lastCheck);
        console.log(`Since last check (${lastCheckDate.toLocaleString()}):`);
        console.log(`- New followers: ${newFollowerCount}`);
        console.log(`- Current total: ${currentFollowers.size}`);
        console.log(`- Previous total: ${Object.keys(existingFollowers).length}`);
      }

      if (newFollowerCount > 0) {
        console.log(`Found ${newFollowerCount} new followers since last check`);
      }
    } else {
      // First run - just store all followers without creating events
      for (const [did, data] of currentFollowers.entries()) {
        persistFollower(did, data);
      }
      console.log(`First run - loaded ${currentFollowers.size} existing followers without creating events`);
    }

    // Update last check timestamp
    statements.setLastCheck.run(new Date().toISOString());
    
    isInitialFetchComplete = true;
    console.log('Initial follower fetch complete');
  } catch (error) {
    console.error('Error during initial follower fetch:', error);
    throw error;
  }
}

let isReconciling = false;

async function reconcileFollowers(myDid) {
  if (isReconciling) {
    console.log('Reconciliation already in progress, skipping...');
    return;
  }

  console.log('Starting follower reconciliation...');
  isReconciling = true;

  try {
    let cursor;
    const currentFollowers = new Map();

    do {
      const response = await agent.getFollowers({ actor: myDid, cursor });
      for (const follow of response.data.followers) {
        const followerData = {
          handle: follow.handle,
          displayName: follow.displayName || '',
          avatar: follow.avatar || '',
          description: follow.description || '',
          indexedAt: new Date().toISOString()
        };
        currentFollowers.set(follow.did, followerData);
      }
      cursor = response.data.cursor;
    } while (cursor);

    // Get all existing followers for reconciliation
    const existingFollowers = statements.getAllFollowers.all().reduce((acc, row) => {
      acc[row.did] = {
        handle: row.handle,
        displayName: row.display_name,
        avatar: row.avatar,
        description: row.description,
        indexedAt: row.indexed_at
      };
      return acc;
    }, {});

    // Handle new followers
    for (const [did, data] of currentFollowers.entries()) {
      if (!existingFollowers[did]) {
        persistFollower(did, data);
        persistEvent({
          type: 'follow',
          did,
          handle: data.handle,
          displayName: data.displayName,
          timestamp: Date.now(),
          createdAt: new Date().toISOString(),
          path: '',
          avatar: data.avatar,
          description: data.description
        });
      }
    }

    // Log potential unfollowers but don't remove them
    // Let the WebSocket handler handle unfollows with verification
    for (const did of Object.keys(existingFollowers)) {
      if (!currentFollowers.has(did)) {
        console.log(`Potential unfollower detected: ${existingFollowers[did].handle}`);
      }
    }

  } catch (error) {
    console.error('Error during reconciliation:', error);
  } finally {
    isReconciling = false;
    console.log('Reconciliation complete');
  }
}

async function monitorFollows() {
  const myDid = agent.session.did;
  console.log(`Monitoring follows/unfollows for your DID: ${myDid}`);

  const ws = new WebSocket('wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos');

  ws.on('open', () => {
    console.log('WebSocket connection established.');
  });

  ws.on('message', async (data) => {
    try {
      const decodedItems = await cbor.decodeAll(data);
      if (decodedItems.length < 2) throw new Error('Invalid CBOR message.');

      const header = decodedItems[0];
      const payload = decodedItems[1];

      if (header.op === 1 && header.t === '#commit') {
        await handleCommit(payload, myDid);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed.');
  });

  const reconciliationInterval = 30 * 60 * 1000; // 30 minutes base interval
  const jitterRange = 5 * 60 * 1000; // 5 minutes jitter

  setInterval(() => {
    const jitter = Math.floor(Math.random() * jitterRange);
    setTimeout(() => reconcileFollowers(myDid), jitter);
  }, reconciliationInterval);
}

async function handleCommit(payload, myDid) {
  if (!isInitialFetchComplete) {
    console.log('Skipping event - initial fetch not complete');
    return;
  }

  const { repo, ops, blocks } = payload;
  if (!ops || repo === myDid) return;

  try {
    const reader = await carReader(blocks);

    for (const op of ops) {
      const [collection, rkey] = op.path.split('/');

      if (collection === 'app.bsky.graph.follow') {
        if (op.action === 'create') {
          try {
            const cid = await decodeCid(op.cid);
            const block = await reader.get(cid);
            if (!block) {
              console.warn('Block not found for CID:', cid.toString());
              continue;
            }

            const followData = cbor.decode(block.bytes);
            
            // Check if this follow is for us
            if (followData.subject === myDid) {
              const followerDid = repo;
              try {
                const profile = await agent.getProfile({ actor: followerDid });
                
                const followerData = {
                  handle: profile.data.handle,
                  displayName: profile.data.displayName || '',
                  avatar: profile.data.avatar || '',
                  description: profile.data.description || '',
                  indexedAt: new Date().toISOString()
                };
                
                // Store in database
                persistFollower(followerDid, followerData);
                
                // Create event
                const eventData = {
                  type: 'follow',
                  did: followerDid,
                  handle: profile.data.handle,
                  displayName: profile.data.displayName || '',
                  timestamp: Date.now(),
                  createdAt: followData.createdAt,
                  path: op.path,
                  avatar: profile.data.avatar || '',
                  description: profile.data.description || ''
                };
                
                persistEvent(eventData);
                
                console.log(`New follower: ${profile.data.handle} (${profile.data.displayName || 'No display name'})`);
              } catch (profileError) {
                console.error(`Error fetching profile for ${followerDid}:`, profileError);
              }
            }
          } catch (error) {
            console.error('Error processing follow:', error);
          }
        } else if (op.action === 'delete') {
          try {
            const followerDid = repo;
            const followerInfo = statements.getFollower.get(followerDid);
            
            if (followerInfo) {
              // Verify unfollow status through API checks
              const hasUnfollowed = await verifyUnfollow(followerDid, myDid);
              
              if (hasUnfollowed === null) {
                return; // Cooldown period
              }
              
              if (hasUnfollowed === true) {
                console.log(`Verified unfollow: ${followerInfo.handle}`);
                
                persistEvent({
                  type: 'unfollow',
                  did: followerDid,
                  handle: followerInfo.handle,
                  displayName: followerInfo.display_name || '',
                  timestamp: Date.now(),
                  path: op.path,
                  avatar: followerInfo.avatar || '',
                  description: followerInfo.description || ''
                });
                
                statements.removeFollower.run(followerDid);
              } else {
                console.log(`Ignoring delete operation - ${followerInfo.handle} is still following`);
              }
            }
          } catch (error) {
            console.error('Error processing unfollow:', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in handleCommit:', error);
  }
}

const recentUnfollowChecks = new Map();
const CHECK_COOLDOWN = 5 * 60 * 1000;

async function verifyUnfollow(followerDid, myDid) {
  const lastCheck = recentUnfollowChecks.get(followerDid);
  const now = Date.now();
  
  if (lastCheck && (now - lastCheck < CHECK_COOLDOWN)) {
    return null;
  }
  
  try {
    // Record this check
    recentUnfollowChecks.set(followerDid, now);
    
    // Clean up old entries
    for (const [did, timestamp] of recentUnfollowChecks.entries()) {
      if (now - timestamp > CHECK_COOLDOWN) {
        recentUnfollowChecks.delete(did);
      }
    }

    // Check their following list first (more accurate)
    let cursor;
    let isFollowing = false;
    
    do {
      const followingResponse = await agent.getFollows({
        actor: followerDid,
        cursor: cursor,
        limit: 100
      });
      
      isFollowing = followingResponse.data.follows.some(f => f.did === myDid);
      if (isFollowing) {
        return false; // They are still following
      }
      
      cursor = followingResponse.data.cursor;
    } while (cursor && !isFollowing);

    // Double check followers list as backup
    cursor = undefined;
    do {
      const followersResponse = await agent.getFollowers({
        actor: myDid,
        cursor: cursor,
        limit: 100
      });
      
      isFollowing = followersResponse.data.followers.some(f => f.did === followerDid);
      if (isFollowing) {
        return false; // They are still following
      }
      
      cursor = followersResponse.data.cursor;
    } while (cursor && !isFollowing);

    // If we get here, they're not in either list
    return true;
    
  } catch (error) {
    console.error(`Error verifying unfollow status for ${followerDid}:`, error);
    return false; // Assume they're still following on error
  }
}

async function main() {
  await authenticate();
  await fetchInitialFollowers();
  monitorFollows();
}

const followEmitter = new EventEmitter();

module.exports = {
  followEmitter,
  getFollowers,
  authenticate,
  main,
  db,
  statements
};
