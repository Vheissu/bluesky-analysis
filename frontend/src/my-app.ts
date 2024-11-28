export class MyApp {
  static routes = [
    {
      path: ['', 'followers'],
      component: () => import('./components/follower-list')
    },
    {
      path: 'analysis',
      component: () => import('./components/follower-analysis')
    },
    {
      path: 'minesweeper',
      component: () => import('./components/minesweeper')
    }
  ];
}
