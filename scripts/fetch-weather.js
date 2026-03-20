#!/usr/bin/env node
/**
 * fetch-weather.js
 * Fetches New Orleans weather from wttr.in and writes data/weather.json
 * Usage: node scripts/fetch-weather.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/weather.json');
const LOCATION = 'New+Orleans,LA';
const URL = `https://wttr.in/${LOCATION}?format=j1`;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'InkThorn-Dashboard/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function describeCode(code) {
  const codes = {
    113: 'Clear', 116: 'Partly Cloudy', 119: 'Cloudy', 122: 'Overcast',
    143: 'Mist', 176: 'Patchy Rain', 179: 'Patchy Snow', 182: 'Patchy Sleet',
    185: 'Patchy Freezing Drizzle', 200: 'Thundery Outbreaks',
    227: 'Blowing Snow', 230: 'Blizzard', 248: 'Fog', 260: 'Freezing Fog',
    263: 'Light Drizzle', 266: 'Light Drizzle', 281: 'Freezing Drizzle',
    284: 'Heavy Freezing Drizzle', 293: 'Light Rain', 296: 'Light Rain',
    299: 'Moderate Rain', 302: 'Moderate Rain', 305: 'Heavy Rain',
    308: 'Heavy Rain', 311: 'Light Freezing Rain', 314: 'Mod. Freezing Rain',
    317: 'Light Sleet', 320: 'Moderate Sleet', 323: 'Light Snow',
    326: 'Light Snow', 329: 'Moderate Snow', 332: 'Moderate Snow',
    335: 'Heavy Snow', 338: 'Heavy Snow', 350: 'Ice Pellets',
    353: 'Light Rain Shower', 356: 'Moderate Rain Shower', 359: 'Heavy Rain Shower',
    362: 'Light Sleet Shower', 365: 'Moderate Sleet Shower', 368: 'Light Snow Shower',
    371: 'Moderate Snow Shower', 374: 'Light Ice Pellet Shower',
    377: 'Moderate Ice Pellet Shower', 386: 'Light Rain + Thunder',
    389: 'Moderate/Heavy Rain + Thunder', 392: 'Light Snow + Thunder',
    395: 'Moderate/Heavy Snow + Thunder'
  };
  return codes[parseInt(code)] || 'Unknown';
}

function weatherEmoji(code) {
  const c = parseInt(code);
  if (c === 113) return '☀️';
  if (c === 116) return '⛅';
  if ([119, 122].includes(c)) return '☁️';
  if ([143, 248, 260].includes(c)) return '🌫️';
  if (c >= 200 && c < 230) return '⛈️';
  if (c >= 293 && c < 320) return '🌧️';
  if (c >= 320 && c < 395) return '🌨️';
  if (c >= 386) return '⛈️';
  return '🌡️';
}

async function main() {
  console.log(`Fetching weather for New Orleans...`);
  const { status, body } = await get(URL);
  if (status !== 200) throw new Error(`wttr.in returned ${status}`);

  const raw = JSON.parse(body);
  const current = raw.current_condition[0];
  const today = raw.weather[0];
  const tomorrow = raw.weather[1];
  const dayAfter = raw.weather[2];

  function dayName(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const output = {
    agent: 'Rob-Agent',
    updated: new Date().toISOString(),
    status: 'ok',
    location: 'New Orleans, LA',
    current: {
      temp_f: parseInt(current.temp_F),
      feels_like_f: parseInt(current.FeelsLikeF),
      humidity: parseInt(current.humidity),
      description: current.weatherDesc[0].value,
      code: current.weatherCode,
      emoji: weatherEmoji(current.weatherCode),
      wind_mph: parseInt(current.windspeedMiles),
      wind_dir: current.winddir16Point,
      visibility_miles: parseInt(current.visibility),
      uv_index: parseInt(current.uvIndex)
    },
    forecast: [
      {
        date: today.date,
        label: dayName(today.date),
        high_f: parseInt(today.maxtempF),
        low_f: parseInt(today.mintempF),
        description: describeCode(today.hourly[4]?.weatherCode || 113),
        emoji: weatherEmoji(today.hourly[4]?.weatherCode || 113),
        sunrise: today.astronomy[0].sunrise,
        sunset: today.astronomy[0].sunset,
        avg_humidity: Math.round(today.hourly.reduce((s, h) => s + parseInt(h.humidity), 0) / today.hourly.length),
        chance_of_rain: Math.max(...today.hourly.map(h => parseInt(h.chanceofrain)))
      },
      {
        date: tomorrow.date,
        label: dayName(tomorrow.date),
        high_f: parseInt(tomorrow.maxtempF),
        low_f: parseInt(tomorrow.mintempF),
        description: describeCode(tomorrow.hourly[4]?.weatherCode || 113),
        emoji: weatherEmoji(tomorrow.hourly[4]?.weatherCode || 113),
        sunrise: tomorrow.astronomy[0].sunrise,
        sunset: tomorrow.astronomy[0].sunset,
        avg_humidity: Math.round(tomorrow.hourly.reduce((s, h) => s + parseInt(h.humidity), 0) / tomorrow.hourly.length),
        chance_of_rain: Math.max(...tomorrow.hourly.map(h => parseInt(h.chanceofrain)))
      },
      {
        date: dayAfter.date,
        label: dayName(dayAfter.date),
        high_f: parseInt(dayAfter.maxtempF),
        low_f: parseInt(dayAfter.mintempF),
        description: describeCode(dayAfter.hourly[4]?.weatherCode || 113),
        emoji: weatherEmoji(dayAfter.hourly[4]?.weatherCode || 113),
        sunrise: dayAfter.astronomy[0].sunrise,
        sunset: dayAfter.astronomy[0].sunset,
        avg_humidity: Math.round(dayAfter.hourly.reduce((s, h) => s + parseInt(h.humidity), 0) / dayAfter.hourly.length),
        chance_of_rain: Math.max(...dayAfter.hourly.map(h => parseInt(h.chanceofrain)))
      }
    ]
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`✅ Weather data written to ${OUTPUT_FILE}`);
  console.log(`   Current: ${output.current.emoji} ${output.current.temp_f}°F - ${output.current.description}`);
  console.log(`   Forecast: ${output.forecast.map(f => `${f.label} ${f.high_f}/${f.low_f}°F`).join(', ')}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
