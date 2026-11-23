import ModelingModule from '../modeling';
import RulesModule from '../rules';

import DCRGraphEditing from './DCRGraphEditing';

export default {
  __depends__: [
    ModelingModule,
    RulesModule
  ],
  dcrGraphEditing: [ 'type', DCRGraphEditing ]
};
