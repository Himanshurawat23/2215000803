const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');

const app = express();
const port = process.env.PORT || 3000;

const cache = new NodeCache({ stdTTL: 60 });

const TEST_SERVER_BASE_URL = 'http://20.244.56.144/evaluation-service';

const CACHE_KEYS = {
  USERS: 'users',
  POSTS: 'posts',
  TOP_USERS: 'top_users',
  TOP_POSTS: 'top_posts',
  LATEST_POSTS: 'latest_posts'
};

async function fetchFromTestServer(endpoint) {
  try {
    const response = await axios.get(`${TEST_SERVER_BASE_URL}${endpoint}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error.message);
    throw error;
  }
}

async function getAllUsers() {
  // Check cache first
  let users = cache.get(CACHE_KEYS.USERS);
  if (users) return users;

  const usersData = await fetchFromTestServer('/users');
  users = usersData.users;
  
  cache.set(CACHE_KEYS.USERS, users);
  return users;
}

async function getUserPosts(userId) {
  const cacheKey = `${CACHE_KEYS.POSTS}_${userId}`;
  let posts = cache.get(cacheKey);
  if (posts) return posts;

  const postsData = await fetchFromTestServer(`/users/${userId}/posts`);
  posts = postsData.posts;
  
  cache.set(cacheKey, posts);
  return posts;
}

async function getPostComments(postId) {
  const cacheKey = `comments_${postId}`;
  let comments = cache.get(cacheKey);
  if (comments) return comments;

  const commentsData = await fetchFromTestServer(`/posts/${postId}/comments`);
  comments = commentsData.comments;
  
  cache.set(cacheKey, comments);
  return comments;
}

async function findTopUsers() {
  const cachedTopUsers = cache.get(CACHE_KEYS.TOP_USERS);
  if (cachedTopUsers) return cachedTopUsers;

  const users = await getAllUsers();
  
  const userCommentCounts = new Map();
  
  const userPromises = Object.entries(users).map(async ([userId, userName]) => {
    const posts = await getUserPosts(userId);
    let totalComments = 0;
    
    const commentPromises = posts.map(async (post) => {
      const comments = await getPostComments(post.id);
      return comments.length;
    });
    
    const commentCounts = await Promise.all(commentPromises);
    totalComments = commentCounts.reduce((sum, count) => sum + count, 0);
    
    return {
      userId,
      userName,
      totalComments
    };
  });
  
  const userStats = await Promise.all(userPromises);
  
  userStats.sort((a, b) => b.totalComments - a.totalComments);
  
  const topUsers = userStats.slice(0, 5);
  
  cache.set(CACHE_KEYS.TOP_USERS, topUsers);
  
  return topUsers;
}

async function getAllPostsWithCommentCounts() {
  const cacheKey = 'all_posts_with_comments';
  let allPostsWithComments = cache.get(cacheKey);
  if (allPostsWithComments) return allPostsWithComments;
  
  const users = await getAllUsers();
  let allPosts = [];
  
  const postsPromises = Object.keys(users).map(async (userId) => {
    const userPosts = await getUserPosts(userId);
    return userPosts.map(post => ({...post, userName: users[userId]}));
  });
  
  const userPostsArrays = await Promise.all(postsPromises);
  allPosts = userPostsArrays.flat();
  
  const postsWithCommentsPromises = allPosts.map(async (post) => {
    const comments = await getPostComments(post.id);
    return {
      ...post,
      commentCount: comments.length,
      comments
    };
  });
  
  allPostsWithComments = await Promise.all(postsWithCommentsPromises);
  
  cache.set(cacheKey, allPostsWithComments);
  
  return allPostsWithComments;
}

async function getTopPosts() {
  const cachedTopPosts = cache.get(CACHE_KEYS.TOP_POSTS);
  if (cachedTopPosts) return cachedTopPosts;
  
  const allPosts = await getAllPostsWithCommentCounts();
  
  allPosts.sort((a, b) => b.commentCount - a.commentCount);
  
  const maxCommentCount = allPosts.length > 0 ? allPosts[0].commentCount : 0;
  
  const topPosts = allPosts.filter(post => post.commentCount === maxCommentCount);
  
  cache.set(CACHE_KEYS.TOP_POSTS, topPosts);
  return topPosts;
}

async function getLatestPosts() {
  const cachedLatestPosts = cache.get(CACHE_KEYS.LATEST_POSTS);
  if (cachedLatestPosts) return cachedLatestPosts;
  
  const allPosts = await getAllPostsWithCommentCounts();
  
  allPosts.sort((a, b) => b.id - a.id);
  
  const latestPosts = allPosts.slice(0, 5);
  
  cache.set(CACHE_KEYS.LATEST_POSTS, latestPosts);
  return latestPosts;
}

app.get('/users', async (req, res) => {
  try {
    const topUsers = await findTopUsers();
    res.json({ topUsers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve top users' });
  }
});

app.get('/posts', async (req, res) => {
  try {
    const type = req.query.type || 'popular';
    
    if (type === 'popular') {
      const topPosts = await getTopPosts();
      res.json({ type: 'popular', posts: topPosts });
    } else if (type === 'latest') {
      const latestPosts = await getLatestPosts();
      res.json({ type: 'latest', posts: latestPosts });
    } else {
      res.status(400).json({ error: 'Invalid type parameter. Use "popular" or "latest".' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve posts' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Social Media Microservice running on port ${port}`);
});

