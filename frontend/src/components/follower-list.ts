import { IEventAggregator, IDisposable } from 'aurelia';
import { inject } from 'aurelia';
import { FollowerService, Follower, FollowEvent } from '../services/follower-service';

@inject(FollowerService, IEventAggregator)
export class FollowerList {
  private followers: Record<string, Follower> = {};
  private displayedFollowers: Array<[string, Follower]> = [];
  private events: FollowEvent[] = [];
  private subscriptions: IDisposable[] = [];
  private currentEventPage = 1;
  private currentFollowerPage = 1;
  private totalFollowerPages = 1;
  private totalEventPages = 1;
  private isLoadingMore = false;
  private pageSize = 20;
  private totalFollowers = 0;

  constructor(
    private followerService: FollowerService,
    private ea: IEventAggregator
  ) {}

  async binding() {
    this.subscriptions = [
      this.ea.subscribe('followers:updated', (followers: Record<string, Follower>) => {
        Object.assign(this.followers, followers);
        this.updateDisplayedFollowers();
      }),
      this.ea.subscribe('follower:event', (event: FollowEvent) => {
        console.log('Received follow event in component:', event);
        this.events.unshift(event);
        if (this.events.length > 50) {
          this.events.pop();
        }
      })
    ];

    try {
      const followerData = await this.followerService.getFollowers(1, this.pageSize);
      this.followers = followerData.followers;
      this.totalFollowerPages = followerData.pagination.totalPages;
      this.totalFollowers = followerData.pagination.total;
      this.updateDisplayedFollowers();

      const eventData = await this.followerService.getEvents(1, 50);
      this.events = eventData.events;
      this.totalEventPages = eventData.pagination.totalPages;
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  private updateDisplayedFollowers() {
    this.displayedFollowers = Object.entries(this.followers).sort((a, b) => 
      a[1].handle.localeCompare(b[1].handle)
    );
  }

  async loadMoreFollowers() {
    if (this.isLoadingMore || this.currentFollowerPage >= this.totalFollowerPages) return;
    
    this.isLoadingMore = true;
    try {
      this.currentFollowerPage++;
      const data = await this.followerService.getFollowers(this.currentFollowerPage, this.pageSize);
      Object.assign(this.followers, data.followers);
      this.updateDisplayedFollowers();
    } catch (error) {
      console.error('Error loading more followers:', error);
    } finally {
      this.isLoadingMore = false;
    }
  }

  handleScroll(event: Event) {
    const element = event.target as HTMLElement;
    const bottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (bottom < 100 && this.displayedFollowers.length < this.totalFollowers) {
      this.loadMoreFollowers();
    }
  }

  unbinding() {
    this.subscriptions.forEach(sub => sub.dispose());
  }

  async loadMoreEvents() {
    if (this.currentEventPage < this.totalEventPages) {
      this.currentEventPage++;
      try {
        const eventData = await this.followerService.getEvents(this.currentEventPage, 50);
        this.events = [...this.events, ...eventData.events];
      } catch (error) {
        console.error('Error loading more events:', error);
      }
    }
  }
} 