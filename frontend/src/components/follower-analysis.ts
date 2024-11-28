import { IHttpClient } from '@aurelia/fetch-client';
import { inject, bindable } from 'aurelia';

interface ActivityData {
  averageActiveTime: string;
  peakHours: string[];
  hourlyActivity: { hour: string; count: number }[];
}

@inject(IHttpClient)
export class FollowerAnalysis {
  @bindable data: ActivityData | null = null;
  loading = true;
  error: string | null = null;

  constructor(private http: IHttpClient) {}

  async attached() {
    await this.fetchAnalysis();
  }

  async fetchAnalysis() {
    this.loading = true;
    this.error = null;
    
    try {
      const response = await this.http.fetch('http://localhost:3000/api/analysis');
      console.log('Analysis response:', response);
      if (!response.ok) throw new Error('Failed to fetch analysis');
      this.data = await response.json();
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  getActivityWidth(activity: { count: number }): string {
    if (!this.data?.hourlyActivity) return '0%';
    
    const maxCount = Math.max(...this.data.hourlyActivity.map(a => a.count));
    return `${(activity.count / maxCount) * 100}%`;
  }
} 