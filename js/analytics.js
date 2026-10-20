// Csámpázó - Analytics, Metrics & Gamification Engine
(function (window) {
  'use strict';

  const BADGES_CONFIG = [
    {
      id: 'badge_first_step',
      title: 'Első Lépések',
      desc: 'Rögzítsd az első kímélő SM sétádat a naplóban!',
      icon: '🌱',
      check: (stats) => stats.totalEntries >= 1
    },
    {
      id: 'badge_100m_hero',
      title: '100m SM Alapteszt ⭐',
      desc: 'Sikeresen teljesítettél egy 100 méteres alapteszt sétát!',
      icon: '⭐',
      check: (stats) => stats.bestDaySteps >= 140 || stats.longestWalkKm >= 0.1
    },
    {
      id: 'badge_streak_7',
      title: '7 Napos SM Széria',
      desc: 'Sétálj minden nap kitartóan legalább 50-100 métert 7 napon át!',
      icon: '🔥',
      check: (stats) => stats.maxStreak >= 7
    },
    {
      id: 'badge_mindful_rest',
      title: 'Tudatos Pad Pihenő',
      desc: 'Pihenő beiktatása padnál az egyensúly és fáradtság kontrollálására!',
      icon: '🪑',
      check: (stats) => stats.totalEntries >= 2
    },
    {
      id: 'badge_200m_stretch',
      title: '200 Méteres Haladás',
      desc: 'Teljesíts egy 200 méteres biztonságos távot egy séta alatt!',
      icon: '🌟',
      check: (stats) => stats.longestWalkKm >= 0.2 || stats.bestDaySteps >= 250
    },
    {
      id: 'badge_500m_champ',
      title: '500m Nagytáv Hős',
      desc: 'Érj el összesen legalább 500 métert a napjaid során!',
      icon: '🏅',
      check: (stats) => stats.totalKm >= 0.5
    },
    {
      id: 'badge_safe_pace',
      title: 'Kímélő Egyenletes Tempó',
      desc: 'Biztonságos egyenletes járás botlásszűréssel!',
      icon: '👟',
      check: (stats) => stats.totalEntries >= 1
    },
    {
      id: 'badge_map_tracker',
      title: 'Térképes Útvonalkövető',
      desc: 'Rögzíts élőben egy GPS-es vagy térképes 100m-es sétát!',
      icon: '🗺️',
      check: (stats) => stats.totalEntries >= 1
    }
  ];

  const VIRTUAL_JOURNEYS = [
    { name: 'Margitszigeti Rózsakert Kímélő Sétaút (100 m)', totalKm: 0.1, icon: '🌸' },
    { name: 'Városligeti Sík Sétány Padokkal (500 m)', totalKm: 0.5, icon: '🌳' },
    { name: 'Feneketlen-tó Kímélő Kör (1 km)', totalKm: 1.0, icon: '🦆' },
    { name: 'Margitszigeti Nagykör (3 km)', totalKm: 3.0, icon: '🏰' }
  ];

  class Analytics {
    computeSummary(entries, profile) {
      if (!entries || entries.length === 0) {
        return {
          totalEntries: 0,
          totalSteps: 0,
          totalKm: 0,
          totalMinutes: 0,
          totalKcal: 0,
          avgSteps: 0,
          avgKm: 0,
          currentStreak: 0,
          maxStreak: 0,
          bestDaySteps: 0,
          bestDayDate: '-',
          longestWalkKm: 0,
          longestWalkDate: '-',
          hikeCount: 0,
          maxSpeedKmh: 0,
          todaySteps: 0,
          todayKm: 0,
          todayKcal: 0,
          todayGoalPercent: 0,
          activeJourney: VIRTUAL_JOURNEYS[0],
          journeyProgress: 0,
          journeyPercent: 0,
          badges: BADGES_CONFIG.map(b => ({ ...b, unlocked: false }))
        };
      }

      const goal = profile.dailyStepGoal || 10000;
      const totalEntries = entries.length;
      let totalSteps = 0;
      let totalKm = 0;
      let totalMinutes = 0;
      let totalKcal = 0;
      let bestDaySteps = 0;
      let bestDayDate = '-';
      let longestWalkKm = 0;
      let longestWalkDate = '-';
      let hikeCount = 0;
      let maxSpeedKmh = 0;

      // Sort by date ascending to calculate streaks
      const sorted = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      sorted.forEach(e => {
        totalSteps += e.steps;
        totalKm += e.km;
        totalMinutes += e.minutes;
        totalKcal += e.kcal;

        if (e.steps > bestDaySteps) {
          bestDaySteps = e.steps;
          bestDayDate = e.date;
        }

        if (e.km > longestWalkKm) {
          longestWalkKm = e.km;
          longestWalkDate = e.date;
        }

        if (e.type === 'Túra' || (e.tags && e.tags.some(t => t.includes('túra') || t.includes('erdő')))) {
          hikeCount++;
        }

        if (e.minutes > 0 && e.km > 0) {
          const speed = (e.km / (e.minutes / 60));
          if (speed > maxSpeedKmh) maxSpeedKmh = speed;
        }
      });

      // Calculate streak (consecutive days >= goal)
      let currentStreak = 0;
      let maxStreak = 0;
      let tempStreak = 0;

      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].steps >= goal) {
          tempStreak++;
          if (tempStreak > maxStreak) maxStreak = tempStreak;
        } else {
          tempStreak = 0;
        }
      }

      // Check current streak ending at latest entry
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].steps >= goal) {
          currentStreak++;
        } else {
          break;
        }
      }

      // Today's entry (or most recent)
      const todayDate = new Date().toISOString().split('T')[0];
      const todayEntry = entries.find(e => e.date === todayDate) || entries[0] || {};
      const todaySteps = todayEntry.steps || 0;
      const todayKm = todayEntry.km || 0;
      const todayKcal = todayEntry.kcal || 0;
      const todayGoalPercent = Math.min(100, Math.round((todaySteps / goal) * 100));

      const avgSteps = Math.round(totalSteps / totalEntries);
      const avgKm = Math.round((totalKm / totalEntries) * 10) / 10;

      // Virtual journey progress
      const activeJourney = VIRTUAL_JOURNEYS.find(j => totalKm < j.totalKm) || VIRTUAL_JOURNEYS[VIRTUAL_JOURNEYS.length - 1];
      const journeyPercent = Math.min(100, Math.round((totalKm / activeJourney.totalKm) * 100));

      const stats = {
        totalEntries,
        totalSteps,
        totalKm: Math.round(totalKm * 10) / 10,
        totalMinutes,
        totalKcal,
        avgSteps,
        avgKm,
        currentStreak,
        maxStreak,
        bestDaySteps,
        bestDayDate,
        longestWalkKm: Math.round(longestWalkKm * 10) / 10,
        longestWalkDate,
        hikeCount,
        maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
        todaySteps,
        todayKm,
        todayKcal,
        todayGoalPercent,
        activeJourney,
        journeyPercent
      };

      // Evaluate badges
      stats.badges = BADGES_CONFIG.map(b => ({
        ...b,
        unlocked: b.check(stats)
      }));

      return stats;
    }
  }

  window.CsampazoAnalytics = Analytics;
})(window);
