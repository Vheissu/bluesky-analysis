import Aurelia from 'aurelia';
import { MyApp } from './my-app';
import { RouterConfiguration } from '@aurelia/router';

Aurelia
  .register(RouterConfiguration.customize({
    useUrlFragmentHash: false,
    swapOrder: 'detach-current-attach-next'
  }))
  .app(MyApp)
  .start();
