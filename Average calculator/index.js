const express = require('express');
const axios = require('axios');
const app = express();

const PORT = 9876;
const WINDOW_SIZE = 10;
const TIMEOUT_MS = 500;
const TEST_SERVER_BASE_URL = 'http://20.244.56.144/evaluation-service';

const numberStorage = {
  p: [], 
  f: [], 
  e: [], 
  r: []  
};

const apiEndpoints = {
  p: `${TEST_SERVER_BASE_URL}/primes`,
  f: `${TEST_SERVER_BASE_URL}/fibo`,
  e: `${TEST_SERVER_BASE_URL}/even`,
  r: `${TEST_SERVER_BASE_URL}/rand`
};

app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

app.get('/numbers/:numberid', async (req, res) => {
  const numberId = req.params.numberid.toLowerCase();
  
  if (!['p', 'f', 'e', 'r'].includes(numberId)) {
    return res.status(400).json({ error: "Invalid number ID. Use 'p' for prime, 'f' for fibonacci, 'e' for even, or 'r' for random numbers." });
  }
  
  try {
    const windowPrevState = [...numberStorage[numberId]];
    
    const newNumbers = await fetchNumbers(numberId);
    
    processNewNumbers(numberId, newNumbers);
    
    const avg = calculateAverage(numberStorage[numberId]);
    
    const response = {
      windowPrevState,
      windowCurrState: numberStorage[numberId],
      numbers: newNumbers,
      avg: parseFloat(avg.toFixed(2))
    };
    
    const responseTime = Date.now() - req.startTime;
    if (responseTime > TIMEOUT_MS) {
      return res.status(408).json({ error: "Response timeout exceeded 500ms" });
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function fetchNumbers(numberId) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const response = await axios.get(apiEndpoints[numberId], {
      signal: controller.signal,
      timeout: TIMEOUT_MS
    });
    
    clearTimeout(timeoutId);
    console.log(response.data)
    return response.data || [];
  } catch (error) {
    console.error(`76 Error fetching ${numberId} numbers:`, error.message);
    return [];
  }
}

function processNewNumbers(numberId, newNumbers) {
  if (!Array.isArray(newNumbers)) {
    return;
  }
  
  const currentStorage = numberStorage[numberId];
  
  for (const num of newNumbers) {
    if (!currentStorage.includes(num)) {
      store.push(num);
      
      if (currentStorage.length > WINDOW_SIZE) {
        currentStorage.shift();
      }
    }
  }
}

function calculateAverage(numbers) {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return sum / numbers.length;
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});