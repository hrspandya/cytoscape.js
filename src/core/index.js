'use strict';

var window = require('../window');
var util = require('../util');
var Collection = require('../collection');
var is = require('../is');
var Promise = require('../promise');
var define = require('../define');

var Core = function( opts ){
  if( !(this instanceof Core) ){
    return new Core(opts);
  }
  var cy = this;

  opts = util.extend({}, opts);

  var container = opts.container;

  // allow for passing a wrapped jquery object
  // e.g. cytoscape({ container: $('#cy') })
  if( container && !is.htmlElement( container ) && is.htmlElement( container[0] ) ){
    container = container[0];
  }

  var reg = container ? container._cyreg : null; // e.g. already registered some info (e.g. readies) via jquery
  reg = reg || {};

  if( reg && reg.cy ){
    reg.cy.destroy();

    reg = {}; // old instance => replace reg completely
  }

  var readies = reg.readies = reg.readies || [];

  if( container ){ container._cyreg = reg; } // make sure container assoc'd reg points to this cy
  reg.cy = cy;

  var head = window !== undefined && container !== undefined && !opts.headless;
  var options = opts;
  options.layout = util.extend( { name: head ? 'grid' : 'null' }, options.layout );
  options.renderer = util.extend( { name: head ? 'canvas' : 'null' }, options.renderer );

  var defVal = function( def, val, altVal ){
    if( val !== undefined ){
      return val;
    } else if( altVal !== undefined ){
      return altVal;
    } else {
      return def;
    }
  };

  var _p = this._private = {
    container: container, // html dom ele container
    ready: false, // whether ready has been triggered
    initrender: false, // has initrender has been triggered
    options: options, // cached options
    elements: [], // array of elements
    id2index: {}, // element id => index in elements array
    listeners: [], // list of listeners
    onRenders: [], // rendering listeners
    aniEles: Collection(this), // elements being animated
    scratch: {}, // scratch object for core
    layout: null,
    renderer: null,
    notificationsEnabled: true, // whether notifications are sent to the renderer
    minZoom: 1e-50,
    maxZoom: 1e50,
    zoomingEnabled: defVal(true, options.zoomingEnabled),
    userZoomingEnabled: defVal(true, options.userZoomingEnabled),
    panningEnabled: defVal(true, options.panningEnabled),
    userPanningEnabled: defVal(true, options.userPanningEnabled),
    boxSelectionEnabled: defVal(true, options.boxSelectionEnabled),
    autolock: defVal(false, options.autolock, options.autolockNodes),
    autoungrabify: defVal(false, options.autoungrabify, options.autoungrabifyNodes),
    autounselectify: defVal(false, options.autounselectify),
    styleEnabled: options.styleEnabled === undefined ? head : options.styleEnabled,
    zoom: is.number(options.zoom) ? options.zoom : 1,
    pan: {
      x: is.plainObject(options.pan) && is.number(options.pan.x) ? options.pan.x : 0,
      y: is.plainObject(options.pan) && is.number(options.pan.y) ? options.pan.y : 0
    },
    animation: { // object for currently-running animations
      current: [],
      queue: []
    },
    hasCompoundNodes: false,
    deferredExecQueue: []
  };

  // set selection type
  var selType = options.selectionType;
  if( selType === undefined || (selType !== 'additive' && selType !== 'single') ){
    // then set default

    _p.selectionType = 'single';
  } else {
    _p.selectionType = selType;
  }

  // init zoom bounds
  if( is.number(options.minZoom) && is.number(options.maxZoom) && options.minZoom < options.maxZoom ){
    _p.minZoom = options.minZoom;
    _p.maxZoom = options.maxZoom;
  } else if( is.number(options.minZoom) && options.maxZoom === undefined ){
    _p.minZoom = options.minZoom;
  } else if( is.number(options.maxZoom) && options.minZoom === undefined ){
    _p.maxZoom = options.maxZoom;
  }

  var loadExtData = function( next ){
    var anyIsPromise = false;

    for( var i = 0; i < extData.length; i++ ){
      var datum = extData[i];

      if( is.promise(datum) ){
        anyIsPromise = true;
        break;
      }
    }

    if( anyIsPromise ){
      return Promise.all( extData ).then( next ); // load all data asynchronously, then exec rest of init
    } else {
      next( extData ); // exec synchronously for convenience
    }
  };

  // create the renderer
  cy.initRenderer( util.extend({
    hideEdgesOnViewport: options.hideEdgesOnViewport,
    hideLabelsOnViewport: options.hideLabelsOnViewport,
    textureOnViewport: options.textureOnViewport,
    wheelSensitivity: is.number(options.wheelSensitivity) && options.wheelSensitivity > 0 ? options.wheelSensitivity : 1,
    motionBlur: options.motionBlur === undefined ? true : options.motionBlur, // on by default
    motionBlurOpacity: options.motionBlurOpacity === undefined ? 0.05 : options.motionBlurOpacity,
    pixelRatio: is.number(options.pixelRatio) && options.pixelRatio > 0 ? options.pixelRatio : (options.pixelRatio === 'auto' ? undefined : 1),
    desktopTapThreshold: options.desktopTapThreshold === undefined ? 4 : options.desktopTapThreshold,
    touchTapThreshold: options.touchTapThreshold === undefined ? 8 : options.touchTapThreshold
  }, options.renderer) );

  var extData = [ options.style, options.elements ];
  loadExtData(function( thens ){
    var initStyle = thens[0];
    var initEles = thens[1];

    // init style
    if( _p.styleEnabled ){
      cy.setStyle( initStyle );
    }

    // trigger the passed function for the `initrender` event
    if( options.initrender ){
      cy.on('initrender', options.initrender);
      cy.on('initrender', function(){
        _p.initrender = true;
      });
    }

    // initial load
    cy.load(initEles, function(){ // onready
      cy.startAnimationLoop();
      _p.ready = true;

      // if a ready callback is specified as an option, the bind it
      if( is.fn( options.ready ) ){
        cy.on('ready', options.ready);
      }

      // bind all the ready handlers registered before creating this instance
      for( var i = 0; i < readies.length; i++ ){
        var fn = readies[i];
        cy.on('ready', fn);
      }
      if( reg ){ reg.readies = []; } // clear b/c we've bound them all and don't want to keep it around in case a new core uses the same div etc

      cy.trigger('ready');
    }, options.done);

  });
};

var corefn = Core.prototype; // short alias

util.extend(corefn, {
  instanceString: function(){
    return 'core';
  },

  isReady: function(){
    return this._private.ready;
  },

  ready: function( fn ){
    if( this.isReady() ){
      this.trigger('ready', [], fn); // just calls fn as though triggered via ready event
    } else {
      this.on('ready', fn);
    }

    return this;
  },

  initrender: function(){
    return this._private.initrender;
  },

  destroy: function(){
    var cy = this;

    cy.stopAnimationLoop();

    cy.notify({ type: 'destroy' }); // destroy the renderer

    var domEle = cy.container();
    if( domEle ){
      domEle._cyreg = null;

      while( domEle.childNodes.length > 0 ){
        domEle.removeChild( domEle.childNodes[0] );
      }
    }

    return cy;
  },

  getElementById: function( id ){
    var index = this._private.id2index[ id ];
    if( index !== undefined ){
      return this._private.elements[ index ];
    }

    // worst case, return an empty collection
    return Collection( this );
  },

  selectionType: function(){
    return this._private.selectionType;
  },

  hasCompoundNodes: function(){
    return this._private.hasCompoundNodes;
  },

  styleEnabled: function(){
    return this._private.styleEnabled;
  },

  addToPool: function( eles ){
    var elements = this._private.elements;
    var id2index = this._private.id2index;

    for( var i = 0; i < eles.length; i++ ){
      var ele = eles[i];

      var id = ele._private.data.id;
      var index = id2index[ id ];
      var alreadyInPool = index !== undefined;

      if( !alreadyInPool ){
        index = elements.length;
        elements.push( ele );
        id2index[ id ] = index;
        ele._private.index = index;
      }
    }

    return this; // chaining
  },

  removeFromPool: function( eles ){
    var elements = this._private.elements;
    var id2index = this._private.id2index;

    for( var i = 0; i < eles.length; i++ ){
      var ele = eles[i];

      var id = ele._private.data.id;
      var index = id2index[ id ];
      var inPool = index !== undefined;

      if( inPool ){
        this._private.id2index[ id ] = undefined;
        elements.splice(index, 1);

        // adjust the index of all elements past this index
        for( var j = index; j < elements.length; j++ ){
          var jid = elements[j]._private.data.id;
          id2index[ jid ]--;
          elements[j]._private.index--;
        }
      }
    }
  },

  container: function(){
    return this._private.container;
  },

  options: function(){
    return util.copy( this._private.options );
  },

  json: function( obj ){
    var cy = this;
    var _p = cy._private;

    if( is.plainObject(obj) ){ // set

      cy.startBatch();

      if( obj.elements ){
        var idInJson = {};

        var updateEles = function( jsons, gr ){
          for( var i = 0; i < jsons.length; i++ ){
            var json = jsons[i];
            var id = json.data.id;
            var ele = cy.getElementById( id );

            idInJson[ id ] = true;

            if( ele.length !== 0 ){ // existing element should be updated
              ele.json( json );
            } else { // otherwise should be added
              if( gr ){
                cy.add( util.extend({ group: gr }, json) );
              } else {
                cy.add( json );
              }
            }
          }
        };

        if( is.array(obj.elements) ){ // elements: []
          updateEles( obj.elements );

        } else { // elements: { nodes: [], edges: [] }
          var grs = ['nodes', 'edges'];
          for( var i = 0; i < grs.length; i++ ){
            var gr = grs[i];
            var elements = obj.elements[ gr ];

            if( is.array(elements) ){
              updateEles( elements, gr );
            }
          }
        }

        // elements not specified in json should be removed
        cy.elements().stdFilter(function( ele ){
          return !idInJson[ ele.id() ];
        }).remove();
      }

      if( obj.style ){
        cy.style( obj.style );
      }

      if( obj.zoom != null && obj.zoom !== _p.zoom ){
        cy.zoom( obj.zoom );
      }

      if( obj.pan ){
        if( obj.pan.x !== _p.pan.x || obj.pan.y !== _p.pan.y ){
          cy.pan( obj.pan );
        }
      }

      var fields = [
        'minZoom', 'maxZoom', 'zoomingEnabled', 'userZoomingEnabled',
        'panningEnabled', 'userPanningEnabled',
        'boxSelectionEnabled',
        'autolock', 'autoungrabify', 'autounselectify'
      ];

      for( var i = 0; i < fields.length; i++ ){
        var f = fields[i];

        if( obj[f] != null ){
          cy[f]( obj[f] );
        }
      }

      cy.endBatch();

      return this; // chaining
    } else if( obj === undefined ){ // get
      var json = {};

      json.elements = {};
      cy.elements().each(function(i, ele){
        var group = ele.group();

        if( !json.elements[group] ){
          json.elements[group] = [];
        }

        json.elements[group].push( ele.json() );
      });

      if( this._private.styleEnabled ){
        json.style = cy.style().json();
      }

      json.zoomingEnabled = cy._private.zoomingEnabled;
      json.userZoomingEnabled = cy._private.userZoomingEnabled;
      json.zoom = cy._private.zoom;
      json.minZoom = cy._private.minZoom;
      json.maxZoom = cy._private.maxZoom;
      json.panningEnabled = cy._private.panningEnabled;
      json.userPanningEnabled = cy._private.userPanningEnabled;
      json.pan = util.copy( cy._private.pan );
      json.boxSelectionEnabled = cy._private.boxSelectionEnabled;
      json.renderer = util.copy( cy._private.options.renderer );
      json.hideEdgesOnViewport = cy._private.options.hideEdgesOnViewport;
      json.hideLabelsOnViewport = cy._private.options.hideLabelsOnViewport;
      json.textureOnViewport = cy._private.options.textureOnViewport;
      json.wheelSensitivity = cy._private.options.wheelSensitivity;
      json.motionBlur = cy._private.options.motionBlur;

      return json;
    }
  },

  scratch: define.data({
    field: 'scratch',
    bindingEvent: 'scratch',
    allowBinding: true,
    allowSetting: true,
    settingEvent: 'scratch',
    settingTriggersEvent: true,
    triggerFnName: 'trigger',
    allowGetting: true
  }),

  removeScratch: define.removeData({
    field: 'scratch',
    event: 'scratch',
    triggerFnName: 'trigger',
    triggerEvent: true
  })

});

[
  require('./add-remove'),
  require('./animation'),
  require('./events'),
  require('./export'),
  require('./layout'),
  require('./notification'),
  require('./renderer'),
  require('./search'),
  require('./style'),
  require('./viewport')
].forEach(function( props ){
  util.extend( corefn, props );
});

module.exports = Core;
