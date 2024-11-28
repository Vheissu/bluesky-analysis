import { IEventAggregator, inject } from 'aurelia';

export interface Follower {
  handle: string;
  displayName: string;
  avatar: string;
  description: string;
  indexedAt: string;
}

export interface FollowEvent {
  type: 'follow' | 'unfollow';
  did: string;
  handle: string;
  displayName: string;
  timestamp: number;
  createdAt: string;
  path: string;
  avatar: string;
  description: string;
}

export interface PaginatedEvents {
  events: FollowEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginatedFollowers {
  followers: Record<string, Follower>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@inject(IEventAggregator)
export class FollowerService {
  private ws: WebSocket | null = null;
  private baseUrl = 'http://localhost:3000/api';
  private wsUrl = 'ws://localhost:3000';

  constructor(private ea: IEventAggregator) {
    this.connectWebSocket();
  }

  public connectWebSocket() {
    console.log('Connecting to WebSocket...');
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      const data = JSON.parse(event.data);
      if (data.type === 'followers') {
        console.log('Received followers update:', Object.keys(data.data).length);
        this.ea.publish('followers:updated', data.data);
      } else if (data.type === 'event') {
        console.log('Received follow event:', data.data);
        this.ea.publish('follower:event', data.data);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed, reconnecting in 5s...');
      setTimeout(() => this.connectWebSocket(), 5000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  async getFollowers(page = 1, limit = 20): Promise<PaginatedFollowers> {
    console.log('Fetching followers...');
    const response = await fetch(
      `${this.baseUrl}/followers?page=${page}&limit=${limit}`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch followers');
    }
    const data = await response.json();
    console.log('Received followers:', Object.keys(data.followers).length);
    return data;
  }

  async getEvents(page = 1, limit = 50): Promise<PaginatedEvents> {
    const response = await fetch(
      `${this.baseUrl}/events?page=${page}&limit=${limit}`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch events');
    }
    return response.json();
  }

  dispose() {
    if (this.ws) {
      this.ws.close();
    }
  }
} 