const { AtpAgent } = require("@atproto/api");
const moment = require("moment");
require("dotenv").config();

const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_PASSWORD;
const timezoneOffset = parseInt(process.env.TIMEZONE_OFFSET, 10); // Timezone offset in hours (e.g., 10 for UTC+10)
const POST_LIMIT = 5; // Limit the number of posts to fetch per follower

const agent = new AtpAgent({ service: "https://bsky.social" });

async function login() {
  try {
    await agent.login({ identifier: handle, password });
    console.log("Successfully logged in with handle:", handle);
  } catch (error) {
    console.error("Error during login:", error.message);
    throw error;
  }
}

function getRandomSubset(array, cap) {
  if (array.length <= cap) return array;

  // Shuffle array and return the first `cap` items
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array.slice(0, cap);
}

async function fetchFollowers() {
  const followers = [];
  let cursor;
  const followerCap = parseInt(process.env.FOLLOWER_CAP, 10) || 1000;

  while (followers.length < followerCap) {
    try {
      const response = await agent.getFollowers({ actor: handle, cursor });
      followers.push(...response.data.followers);

      console.log(
        `Fetched ${response.data.followers.length} followers (total: ${followers.length})`
      );

      cursor = response.data.cursor;

      // Break if we've fetched all available followers
      if (!cursor || followers.length >= followerCap) break;
    } catch (error) {
      console.error("Error fetching followers:", error.message);
      throw error;
    }
  }

  console.log(`Total followers fetched: ${followers.length}`);

  // Randomize followers if we fetched more than the cap
  return getRandomSubset(followers, followerCap);
}

async function fetchPosts(user) {
  console.log(`Fetching up to ${POST_LIMIT} posts for user: ${user}...`);
  try {
    const response = await agent.getAuthorFeed({
      actor: user,
      limit: POST_LIMIT,
    });
    console.log(`Fetched ${response.data.feed.length} posts for user: ${user}`);
    return response.data.feed;
  } catch (error) {
    console.error(`Error fetching posts for user ${user}:`, error.message);
    throw error;
  }
}

function analyzeActivity(posts) {
  const hourActivity = Array(24).fill(0);

  posts.forEach((item) => {
    if (item.post && item.post.record && item.post.record.createdAt) {
      const hour = moment(item.post.record.createdAt)
        .utc()
        .add(timezoneOffset, "hours")
        .hour();
      hourActivity[hour]++;
    }
  });

  return hourActivity;
}

function formatHour(hour) {
  const amPm = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12; // Convert 0 to 12 for midnight
  return `${normalizedHour} ${amPm}`;
}

function calculateAverageActiveTime(activity) {
  let totalHours = 0;
  let totalActivity = 0;

  activity.forEach((count, hour) => {
    totalHours += count * hour;
    totalActivity += count;
  });

  const averageHour = totalActivity > 0 ? totalHours / totalActivity : 0;
  return formatHour(Math.round(averageHour));
}

function findOptimalPostingWindow(activity) {
  const maxActivity = Math.max(...activity);

  return activity
    .map((count, hour) => ({ hour, count }))
    .filter(({ count }) => count === maxActivity)
    .map(({ hour }) => formatHour(hour));
}

module.exports = {
  login,
  fetchFollowers,
  fetchPosts,
  analyzeActivity,
  calculateAverageActiveTime,
  findOptimalPostingWindow,
  formatHour
};
