// Csámpázó - High Performance Canvas Chart Engine
(function (window) {
  'use strict';

  class ChartEngine {
    constructor() {
      this.hoverState = null;
    }

    _setupCanvas(canvas) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = rect.width || canvas.parentElement.clientWidth || 400;
      const height = rect.height || 320;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const ctx = canvas.getContext('2d');
      ctx.resetTransform?.();
      ctx.scale(dpr, dpr);

      return { ctx, width, height, dpr };
    }

    // --- MAIN TREND CHART (Steps + 7-day Moving Average + Goal Line) ---
    renderTrendChart(canvas, entriesAsc, profile, activeFilter = 30) {
      if (!canvas) return;
      const { ctx, width, height } = this._setupCanvas(canvas);
      ctx.clearRect(0, 0, width, height);

      let data = [...(entriesAsc || [])];
      if (activeFilter && activeFilter > 0) {
        data = data.slice(-activeFilter);
      }

      if (data.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Nincs megjeleníthető lépésadat ebben az időszakban', width / 2, height / 2);
        return;
      }

      const padding = { top: 32, right: 30, bottom: 40, left: 55 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;

      const goal = profile.dailyStepGoal || 10000;
      const stepVals = data.map(d => d.steps);
      const maxVal = Math.max(goal * 1.15, ...stepVals, 5000);
      const minVal = 0;
      const valRange = maxVal - minVal;

      const getX = (i) => padding.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
      const getY = (val) => padding.top + chartH - ((val - minVal) / valRange) * chartH;

      // 1. Grid Lines & Y-axis labels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      const yStep = Math.ceil(maxVal / 4 / 1000) * 1000;

      for (let yVal = 0; yVal <= maxVal; yVal += yStep) {
        const y = getY(yVal);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(yVal >= 1000 ? `${(yVal / 1000).toFixed(0)}k` : yVal, padding.left - 10, y + 4);
      }

      // 2. Target Goal Line (Dotted Amber/Green)
      const goalY = getY(goal);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding.left, goalY);
      ctx.lineTo(width - padding.right, goalY);
      ctx.stroke();

      // Goal Tag
      ctx.fillStyle = '#f59e0b';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`CÉL: ${goal.toLocaleString()}`, width - padding.right, goalY - 6);
      ctx.restore();

      // 3. Step Area Fill & Line
      const gradFill = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradFill.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
      gradFill.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

      ctx.beginPath();
      ctx.moveTo(getX(0), getY(0));
      for (let i = 0; i < data.length; i++) {
        const x = getX(i);
        const y = getY(data[i].steps);
        if (i === 0) ctx.lineTo(x, y);
        else {
          const prevX = getX(i - 1);
          const prevY = getY(data[i - 1].steps);
          const cpX = (prevX + x) / 2;
          ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
        }
      }
      ctx.lineTo(getX(data.length - 1), getY(0));
      ctx.closePath();
      ctx.fillStyle = gradFill;
      ctx.fill();

      // Draw Main Line
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = getX(i);
        const y = getY(data[i].steps);
        if (i === 0) ctx.moveTo(x, y);
        else {
          const prevX = getX(i - 1);
          const prevY = getY(data[i - 1].steps);
          const cpX = (prevX + x) / 2;
          ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
        }
      }
      ctx.stroke();

      // 4. Moving Average Line (7 days rolling avg)
      if (data.length >= 3) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();

        for (let i = 0; i < data.length; i++) {
          const windowStart = Math.max(0, i - 6);
          const slice = data.slice(windowStart, i + 1);
          const avg = slice.reduce((acc, c) => acc + c.steps, 0) / slice.length;
          const x = getX(i);
          const y = getY(avg);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 5. Data Points (Glow Dots)
      data.forEach((d, i) => {
        const x = getX(i);
        const y = getY(d.steps);
        const isGoalMet = d.steps >= goal;

        ctx.fillStyle = isGoalMet ? '#34d399' : '#10b981';
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#070b14';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // 6. X-axis date labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';

      const labelInterval = Math.max(1, Math.floor(data.length / 6));
      for (let i = 0; i < data.length; i += labelInterval) {
        const x = getX(i);
        const dateStr = data[i].date ? data[i].date.substring(5) : '';
        ctx.fillText(dateStr, x, padding.top + chartH + 22);
      }
    }

    // --- WEEKLY BAR CHART (Hétfő - Vasárnap) ---
    renderWeeklyBarChart(canvas, entriesAsc, profile) {
      if (!canvas) return;
      const { ctx, width, height } = this._setupCanvas(canvas);
      ctx.clearRect(0, 0, width, height);

      const days = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
      const sums = [0, 0, 0, 0, 0, 0, 0];
      const counts = [0, 0, 0, 0, 0, 0, 0];

      (entriesAsc || []).forEach(e => {
        if (!e.date) return;
        const d = new Date(e.date);
        // JS getDay(): 0 is Sunday, 1 is Monday...
        const jsDay = d.getDay();
        const monIdx = jsDay === 0 ? 6 : jsDay - 1;
        sums[monIdx] += e.steps;
        counts[monIdx] += 1;
      });

      const averages = sums.map((s, idx) => counts[idx] > 0 ? Math.round(s / counts[idx]) : 0);
      const goal = profile.dailyStepGoal || 10000;
      const maxVal = Math.max(goal * 1.15, ...averages, 5000);

      const padding = { top: 25, right: 20, bottom: 35, left: 50 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;

      const barWidth = Math.min(36, chartW / 7 - 12);
      const getY = (val) => padding.top + chartH - (val / maxVal) * chartH;

      // Draw bars
      averages.forEach((avg, i) => {
        const xCenter = padding.left + (i + 0.5) * (chartW / 7);
        const x = xCenter - barWidth / 2;
        const y = getY(avg);
        const h = chartH - (y - padding.top);

        const isGoalMet = avg >= goal;
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        if (isGoalMet) {
          grad.addColorStop(0, '#34d399');
          grad.addColorStop(1, '#059669');
        } else {
          grad.addColorStop(0, '#06b6d4');
          grad.addColorStop(1, '#0284c7');
        }

        ctx.fillStyle = grad;
        // Rounded bar top
        ctx.beginPath();
        const radius = 6;
        ctx.roundRect ? ctx.roundRect(x, y, barWidth, h, [radius, radius, 0, 0]) : ctx.rect(x, y, barWidth, h);
        ctx.fill();

        // Value text
        if (avg > 0) {
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '10px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(avg >= 1000 ? `${(avg / 1000).toFixed(1)}k` : avg, xCenter, y - 6);
        }

        // Day label
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(days[i].substring(0, 3), xCenter, padding.top + chartH + 20);
      });

      // Target dashed line
      const goalY = getY(goal);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padding.left, goalY);
      ctx.lineTo(width - padding.right, goalY);
      ctx.stroke();
      ctx.restore();
    }
  }

  window.CsampazoChartEngine = ChartEngine;
})(window);
