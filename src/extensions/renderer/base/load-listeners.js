'use strict';

var is = require('../../../is');
var util = require('../../../util');
var Event = require('../../../event');
var Collection = require('../../../collection');

var BRp = {};

BRp.registerBinding = function(target, event, handler, useCapture){
  this.bindings.push({
    target: target,
    event: event,
    handler: handler,
    useCapture: useCapture
  });

  target.addEventListener(event, handler, useCapture);
};

BRp.nodeIsDraggable = function(node) {
  if (node._private.style['opacity'].value !== 0
    && node._private.style['visibility'].value == 'visible'
    && node._private.style['display'].value == 'element'
    && !node.locked()
    && node.grabbable() ) {

    return true;
  }

  return false;
};

BRp.load = function() {
  var r = this;

  var triggerEvents = function( target, names, e, props ){
    if( target == null ){
      target = r.cy;
    }

    for( var i = 0; i < names.length; i++ ){
      var name = names[i];

      var event = Event( e, util.extend({ type: name }, props) );
      target.trigger( event );
    }
  };

  var isMultSelKeyDown = function( e ){
    return e.shiftKey || e.metaKey || e.ctrlKey; // maybe e.altKey
  };

  var getDragListIds = function(opts){
    var listHasId;

    if( opts.addToList && r.cy.hasCompoundNodes() ){ // only needed for compound graphs
      if( !opts.addToList.hasId ){ // build ids lookup if doesn't already exist
        opts.addToList.hasId = {};

        for( var i = 0; i < opts.addToList.length; i++ ){
          var ele = opts.addToList[i];

          opts.addToList.hasId[ ele.id() ] = true;
        }
      }

      listHasId = opts.addToList.hasId;
    }

    return listHasId || {};
  };

  // helper function to determine which child nodes and inner edges
  // of a compound node to be dragged as well as the grabbed and selected nodes
  var addDescendantsToDrag = function(node, opts){
    if( !node._private.cy.hasCompoundNodes() ){
      return;
    }

    if( opts.inDragLayer == null && opts.addToList == null ){ return; } // nothing to do

    var listHasId = getDragListIds( opts );

    var innerNodes = node.descendants();

    for( var i = 0; i < innerNodes.size(); i++ ){
      var iNode = innerNodes[i];
      var _p = iNode._private;

      if( opts.inDragLayer ){
        _p.rscratch.inDragLayer = true;
      }

      if( opts.addToList && !listHasId[ iNode.id() ] ){
        opts.addToList.push( iNode );
        listHasId[ iNode.id() ] = true;

        _p.grabbed = true;
      }

      var edges = _p.edges;
      for( var j = 0; opts.inDragLayer && j < edges.length; j++ ){
        edges[j]._private.rscratch.inDragLayer = true;
      }
    }
  };

  // adds the given nodes, and its edges to the drag layer
  var addNodeToDrag = function(node, opts){

    var _p = node._private;
    var listHasId = getDragListIds( opts );

    if( opts.inDragLayer ){
      _p.rscratch.inDragLayer = true;
    }

    if( opts.addToList && !listHasId[ node.id() ] ){
      opts.addToList.push( node );
      listHasId[ node.id() ] = true;

      _p.grabbed = true;
    }

    var edges = _p.edges;
    for( var i = 0; opts.inDragLayer && i < edges.length; i++ ){
      edges[i]._private.rscratch.inDragLayer = true;
    }

    addDescendantsToDrag( node, opts ); // always add to drag

    // also add nodes and edges related to the topmost ancestor
    updateAncestorsInDragLayer( node, {
      inDragLayer: opts.inDragLayer
    } );
  };

  var freeDraggedElements = function( draggedElements ){
    if( !draggedElements ){ return; }

    for (var i=0; i < draggedElements.length; i++) {

      var dEi_p = draggedElements[i]._private;

      if(dEi_p.group === 'nodes') {
        dEi_p.rscratch.inDragLayer = false;
        dEi_p.grabbed = false;

        var sEdges = dEi_p.edges;
        for( var j = 0; j < sEdges.length; j++ ){ sEdges[j]._private.rscratch.inDragLayer = false; }

        // for compound nodes, also remove related nodes and edges from the drag layer
        updateAncestorsInDragLayer(draggedElements[i], { inDragLayer: false });

      } else if( dEi_p.group === 'edges' ){
        dEi_p.rscratch.inDragLayer = false;
      }

    }
  };

  // helper function to determine which ancestor nodes and edges should go
  // to the drag layer (or should be removed from drag layer).
  var updateAncestorsInDragLayer = function(node, opts) {

    if( opts.inDragLayer == null && opts.addToList == null ){ return; } // nothing to do

    // find top-level parent
    var parent = node;

    if( !node._private.cy.hasCompoundNodes() ){
      return;
    }

    while( parent.parent().nonempty() ){
      parent = parent.parent()[0];
    }

    // no parent node: no nodes to add to the drag layer
    if( parent == node ){
      return;
    }

    var nodes = parent.descendants()
      .merge( parent )
      .unmerge( node )
      .unmerge( node.descendants() )
    ;

    var edges = nodes.connectedEdges();

    var listHasId = getDragListIds( opts );

    for( var i = 0; i < nodes.size(); i++ ){
      if( opts.inDragLayer !== undefined ){
        nodes[i]._private.rscratch.inDragLayer = opts.inDragLayer;
      }

      if( opts.addToList && !listHasId[ nodes[i].id() ] ){
        opts.addToList.push( nodes[i] );
        listHasId[ nodes[i].id() ] = true;

        nodes[i]._private.grabbed = true;
      }
    }

    for( var j = 0; opts.inDragLayer !== undefined && j < edges.length; j++ ) {
      edges[j]._private.rscratch.inDragLayer = opts.inDragLayer;
    }
  };

  if( typeof MutationObserver !== 'undefined' ){
    r.removeObserver = new MutationObserver(function( mutns ){
      for( var i = 0; i < mutns.length; i++ ){
        var mutn = mutns[i];
        var rNodes = mutn.removedNodes;

        if( rNodes ){ for( var j = 0; j < rNodes.length; j++ ){
          var rNode = rNodes[j];

          if( rNode === r.container ){
            r.destroy();
            break;
          }
        } }
      }
    });

    if( r.container.parentNode ){
      r.removeObserver.observe( r.container.parentNode, { childList: true } );
    }
  } else {
    r.registerBinding(r.container, 'DOMNodeRemoved', function(e){
      r.destroy();
    });
  }



  // auto resize
  r.registerBinding(window, 'resize', util.debounce( function(e) {
    r.invalidateContainerClientCoordsCache();

    r.matchCanvasSize(r.container);
    r.redrawHint('eles', true);
    r.redraw();
  }, 100 ) );

  var invalCtnrBBOnScroll = function(domEle){
    r.registerBinding(domEle, 'scroll', function(e){
      r.invalidateContainerClientCoordsCache();
    } );
  };

  var bbCtnr = r.cy.container();

  for( ;; ){

    invalCtnrBBOnScroll( bbCtnr );

    if( bbCtnr.parentNode ){
      bbCtnr = bbCtnr.parentNode;
    } else {
      break;
    }

  }

  // stop right click menu from appearing on cy
  r.registerBinding(r.container, 'contextmenu', function(e){
    e.preventDefault();
  });

  var inBoxSelection = function(){
    return r.selection[4] !== 0;
  };

  // Primary key
  r.registerBinding(r.container, 'mousedown', function(e) {
    e.preventDefault();
    r.hoverData.capture = true;
    r.hoverData.which = e.which;

    var cy = r.cy;
    var pos = r.projectIntoViewport(e.clientX, e.clientY);
    var select = r.selection;
    var near = r.findNearestElement(pos[0], pos[1], true, false);
    var draggedElements = r.dragData.possibleDragElements;

    r.hoverData.mdownPos = pos;

    var checkForTaphold = function(){
      r.hoverData.tapholdCancelled = false;

      clearTimeout( r.hoverData.tapholdTimeout );

      r.hoverData.tapholdTimeout = setTimeout(function(){

        if( r.hoverData.tapholdCancelled ){
          return;
        } else {
          var ele = r.hoverData.down;

          if( ele ){
            ele.trigger( Event(e, {
              type: 'taphold',
              cyPosition: { x: pos[0], y: pos[1] }
            }) );
          } else {
            cy.trigger( Event(e, {
              type: 'taphold',
              cyPosition: { x: pos[0], y: pos[1] }
            }) );
          }
        }

      }, r.tapholdDuration);
    };

    // Right click button
    if( e.which == 3 ){

      r.hoverData.cxtStarted = true;

      var cxtEvt = Event(e, {
        type: 'cxttapstart',
        cyPosition: { x: pos[0], y: pos[1] }
      });

      if( near ){
        near.activate();
        near.trigger( cxtEvt );

        r.hoverData.down = near;
      } else {
        cy.trigger( cxtEvt );
      }

      r.hoverData.downTime = (new Date()).getTime();
      r.hoverData.cxtDragged = false;

    // Primary button
    } else if (e.which == 1) {

      if( near ){
        near.activate();
      }

      // Element dragging
      {
        // If something is under the cursor and it is draggable, prepare to grab it
        if (near != null) {

          if( r.nodeIsDraggable(near) ){

            var grabEvent = Event(e, {
              type: 'grab',
              cyPosition: { x: pos[0], y: pos[1] }
            });

            if ( near.isNode() && !near.selected() ){

              draggedElements = r.dragData.possibleDragElements = [];
              addNodeToDrag( near, { addToList: draggedElements } );

              near.trigger(grabEvent);

            } else if ( near.isNode() && near.selected() ){
              draggedElements = r.dragData.possibleDragElements = [  ];

              var selectedNodes = cy.$(function(){ return this.isNode() && this.selected(); });

              for( var i = 0; i < selectedNodes.length; i++ ){

                // Only add this selected node to drag if it is draggable, eg. has nonzero opacity
                if( r.nodeIsDraggable( selectedNodes[i] ) ){
                  addNodeToDrag( selectedNodes[i], { addToList: draggedElements } );
                }
              }

              near.trigger( grabEvent );
            }

            r.redrawHint('eles', true);
            r.redrawHint('drag', true);

          }

        }

        r.hoverData.down = near;
        r.hoverData.downTime = (new Date()).getTime();
      }

      triggerEvents( near, ['mousedown', 'tapstart', 'vmousedown'], e, {
        cyPosition: { x: pos[0], y: pos[1] }
      } );

      if ( near == null ) {
        select[4] = 1;

        r.data.bgActivePosistion = {
          x: pos[0],
          y: pos[1]
        };

        r.redrawHint('select', true);

        r.redraw();
      } else if( near.isEdge() ){
        select[4] = 1; // for future pan
      }

      checkForTaphold();

    }

    // Initialize selection box coordinates
    select[0] = select[2] = pos[0];
    select[1] = select[3] = pos[1];

  }, false);

  r.registerBinding(window, 'mousemove', function(e) {
    var preventDefault = false;
    var capture = r.hoverData.capture;

    // save cycles if mouse events aren't to be captured
    if ( !capture ){
      var containerPageCoords = r.findContainerClientCoords();

      if (e.clientX > containerPageCoords[0] && e.clientX < containerPageCoords[0] + r.canvasWidth
        && e.clientY > containerPageCoords[1] && e.clientY < containerPageCoords[1] + r.canvasHeight
      ) {
        // inside container bounds so OK
      } else {
        return;
      }

      var cyContainer = r.container;
      var target = e.target;
      var tParent = target.parentNode;
      var containerIsTarget = false;

      while( tParent ){
        if( tParent === cyContainer ){
          containerIsTarget = true;
          break;
        }

        tParent = tParent.parentNode;
      }

      if( !containerIsTarget ){ return; } // if target is outisde cy container, then this event is not for us
    }

    var cy = r.cy;
    var zoom = cy.zoom();
    var pos = r.projectIntoViewport(e.clientX, e.clientY);
    var select = r.selection;

    var near = null;
    if( !r.hoverData.draggingEles ){
      near = r.findNearestElement(pos[0], pos[1], true, false);
    }
    var last = r.hoverData.last;
    var down = r.hoverData.down;

    var disp = [pos[0] - select[2], pos[1] - select[3]];

    var draggedElements = r.dragData.possibleDragElements;

    var dx = select[2] - select[0];
    var dx2 = dx * dx;
    var dy = select[3] - select[1];
    var dy2 = dy * dy;
    var dist2 = dx2 + dy2;
    var rdist2 = dist2 * zoom * zoom;

    var multSelKeyDown = isMultSelKeyDown( e );

    r.hoverData.tapholdCancelled = true;

    var updateDragDelta = function(){
      var dragDelta = r.hoverData.dragDelta = r.hoverData.dragDelta || [];

      if( dragDelta.length === 0 ){
        dragDelta.push( disp[0] );
        dragDelta.push( disp[1] );
      } else {
        dragDelta[0] += disp[0];
        dragDelta[1] += disp[1];
      }
    };


    preventDefault = true;

    triggerEvents( near, ['mousemove', 'vmousemove', 'tapdrag'], e, {
      cyPosition: { x: pos[0], y: pos[1] }
    } );

    // trigger context drag if rmouse down
    if( r.hoverData.which === 3 ){
      var cxtEvt = Event(e, {
        type: 'cxtdrag',
        cyPosition: { x: pos[0], y: pos[1] }
      });

      if( down ){
        down.trigger( cxtEvt );
      } else {
        cy.trigger( cxtEvt );
      }

      r.hoverData.cxtDragged = true;

      if( !r.hoverData.cxtOver || near !== r.hoverData.cxtOver ){

        if( r.hoverData.cxtOver ){
          r.hoverData.cxtOver.trigger( Event(e, {
            type: 'cxtdragout',
            cyPosition: { x: pos[0], y: pos[1] }
          }) );
        }

        r.hoverData.cxtOver = near;

        if( near ){
          near.trigger( Event(e, {
            type: 'cxtdragover',
            cyPosition: { x: pos[0], y: pos[1] }
          }) );
        }

      }

    // Check if we are drag panning the entire graph
    } else if (r.hoverData.dragging) {
      preventDefault = true;

      if( cy.panningEnabled() && cy.userPanningEnabled() ){
        var deltaP;

        if( r.hoverData.justStartedPan ){
          var mdPos = r.hoverData.mdownPos;

          deltaP = {
            x: ( pos[0] - mdPos[0] ) * zoom,
            y: ( pos[1] - mdPos[1] ) * zoom
          };

          r.hoverData.justStartedPan = false;

        } else {
          deltaP = {
            x: disp[0] * zoom,
            y: disp[1] * zoom
          };

        }

        cy.panBy( deltaP );

        r.hoverData.dragged = true;
      }

      // Needs reproject due to pan changing viewport
      pos = r.projectIntoViewport(e.clientX, e.clientY);

    // Checks primary button down & out of time & mouse not moved much
    } else if(
        select[4] == 1 && (down == null || down.isEdge())
    ){

      if( !r.hoverData.dragging && cy.boxSelectionEnabled() && ( multSelKeyDown || !cy.panningEnabled() || !cy.userPanningEnabled() ) ){
        r.data.bgActivePosistion = undefined;
        r.hoverData.selecting = true;

        r.redrawHint('select', true);
        r.redraw();

      } else if( !r.hoverData.selecting && cy.panningEnabled() && cy.userPanningEnabled() ){
        r.hoverData.dragging = true;
        r.hoverData.justStartedPan = true;
        select[4] = 0;

        r.data.bgActivePosistion = {
          x: pos[0],
          y: pos[1]
        };

        r.redrawHint('select', true);
        r.redraw();
      }

      if( down && down.isEdge() && down.active() ){ down.unactivate(); }

    } else {
      if( down && down.isEdge() && down.active() ){ down.unactivate(); }

      if (near != last) {

        if (last) {
          triggerEvents( last, ['mouseout', 'tapdragout'], e, {
            cyPosition: { x: pos[0], y: pos[1] }
          } );
        }

        if (near) {
          triggerEvents( near, ['mouseover', 'tapdragover'], e, {
            cyPosition: { x: pos[0], y: pos[1] }
          } );
        }

        r.hoverData.last = near;
      }

      if( down && down.isNode() && r.nodeIsDraggable(down) ){

        if( rdist2 >= r.desktopTapThreshold2 ){ // then drag

          var justStartedDrag = !r.dragData.didDrag;

          if( justStartedDrag ) {
            r.redrawHint('eles', true);
          }

          r.dragData.didDrag = true; // indicate that we actually did drag the node

          var toTrigger = [];

          for( var i = 0; i < draggedElements.length; i++ ){
            var dEle = draggedElements[i];

            // now, add the elements to the drag layer if not done already
            if( !r.hoverData.draggingEles ){
              addNodeToDrag( dEle, { inDragLayer: true } );
            }

            // Locked nodes not draggable, as well as non-visible nodes
            if( dEle.isNode() && r.nodeIsDraggable(dEle) && dEle.grabbed() ){
              var dPos = dEle._private.position;

              toTrigger.push( dEle );

              if( is.number(disp[0]) && is.number(disp[1]) ){
                var updatePos = !dEle.isParent();

                if( updatePos ){
                  dPos.x += disp[0];
                  dPos.y += disp[1];
                }

                if( justStartedDrag ){
                  var dragDelta = r.hoverData.dragDelta;

                  if( updatePos && is.number(dragDelta[0]) && is.number(dragDelta[1]) ){
                    dPos.x += dragDelta[0];
                    dPos.y += dragDelta[1];
                  }
                }
              }

            }
          }

          r.hoverData.draggingEles = true;

          var tcol = (Collection(cy, toTrigger));

          tcol.updateCompoundBounds();
          tcol.trigger('position drag');

          r.redrawHint('drag', true);
          r.redraw();

        } else { // otherwise save drag delta for when we actually start dragging so the relative grab pos is constant
          updateDragDelta();
        }
      }

      // prevent the dragging from triggering text selection on the page
      preventDefault = true;
    }

    select[2] = pos[0]; select[3] = pos[1];

    if( preventDefault ){
      if(e.stopPropagation) e.stopPropagation();
        if(e.preventDefault) e.preventDefault();
        return false;
      }
  }, false);

  r.registerBinding(window, 'mouseup', function(e) {
    var capture = r.hoverData.capture;
    if (!capture) { return; }
    r.hoverData.capture = false;

    var cy = r.cy; var pos = r.projectIntoViewport(e.clientX, e.clientY); var select = r.selection;
    var near = r.findNearestElement(pos[0], pos[1], true, false);
    var draggedElements = r.dragData.possibleDragElements; var down = r.hoverData.down;
    var multSelKeyDown = isMultSelKeyDown( e );

    if( r.data.bgActivePosistion ){
      r.redrawHint('select', true);
      r.redraw();
    }

    r.hoverData.tapholdCancelled = true;

    r.data.bgActivePosistion = undefined; // not active bg now

    if( down ){
      down.unactivate();
    }

    if( r.hoverData.which === 3 ){
      var cxtEvt = Event(e, {
        type: 'cxttapend',
        cyPosition: { x: pos[0], y: pos[1] }
      });

      if( down ){
        down.trigger( cxtEvt );
      } else {
        cy.trigger( cxtEvt );
      }

      if( !r.hoverData.cxtDragged ){
        var cxtTap = Event(e, {
          type: 'cxttap',
          cyPosition: { x: pos[0], y: pos[1] }
        });

        if( down ){
          down.trigger( cxtTap );
        } else {
          cy.trigger( cxtTap );
        }
      }

      r.hoverData.cxtDragged = false;
      r.hoverData.which = null;

    } else if( r.hoverData.which === 1 ) {

      // Deselect all elements if nothing is currently under the mouse cursor and we aren't dragging something
      if ( (down == null) // not mousedown on node
        && !r.dragData.didDrag // didn't move the node around
        && !r.hoverData.selecting // not box selection
        && !r.hoverData.dragged // didn't pan
        && !isMultSelKeyDown( e )
      ) {

        cy.$(function(){
          return this.selected();
        }).unselect();

        if (draggedElements.length > 0) {
          r.redrawHint('eles', true);
        }

        r.dragData.possibleDragElements = draggedElements = [];
      }

      triggerEvents( near, ['mouseup', 'tapend', 'vmouseup'], e, {
        cyPosition: { x: pos[0], y: pos[1] }
      } );

      if(
        !r.dragData.didDrag // didn't move a node around
        && !r.hoverData.dragged // didn't pan
      ){
        triggerEvents( near, ['click', 'tap', 'vclick'], e, {
          cyPosition: { x: pos[0], y: pos[1] }
        } );
      }

      // Single selection
      if( near == down && !r.dragData.didDrag && !r.hoverData.selecting ){
        if( near != null && near._private.selectable ){

          if( r.hoverData.dragging ){
            // if panning, don't change selection state
          } else if( cy.selectionType() === 'additive' || multSelKeyDown ){
            if( near.selected() ){
              near.unselect();
            } else {
              near.select();
            }
          } else {
            if( !multSelKeyDown ){
              cy.$(':selected').unmerge( near ).unselect();
              near.select();
            }
          }

          r.redrawHint('eles', true);
        }
      }

      if ( r.hoverData.selecting ) {
        var newlySelected = [];
        var box = r.getAllInBox( select[0], select[1], select[2], select[3] );

        r.redrawHint('select', true);

        if( box.length > 0 ) {
          r.redrawHint('eles', true);
        }

        for( var i = 0; i < box.length; i++ ){
          if( box[i]._private.selectable ){
            newlySelected.push( box[i] );
          }
        }

        var newlySelCol = Collection( cy, newlySelected );

        if( cy.selectionType() === 'additive' ){
          newlySelCol.select();
        } else {
          if( !multSelKeyDown ){
            cy.$(':selected').unmerge( newlySelCol ).unselect();
          }

          newlySelCol.select();
        }

        // always need redraw in case eles unselectable
        r.redraw();

      }

      // Cancel drag pan
      if( r.hoverData.dragging ){
        r.hoverData.dragging = false;

        r.redrawHint('select', true);
        r.redrawHint('eles', true);

        r.redraw();
      }

      if (!select[4]) {


        r.redrawHint('drag', true);
        r.redrawHint('eles', true);

        freeDraggedElements( draggedElements );

        if( down ){ down.trigger('free'); }
      }

    } // else not right mouse

    select[4] = 0; r.hoverData.down = null;

    r.hoverData.cxtStarted = false;
    r.hoverData.draggingEles = false;
    r.hoverData.selecting = false;
    r.dragData.didDrag = false;
    r.hoverData.dragged = false;
    r.hoverData.dragDelta = [];

  }, false);

  var wheelHandler = function(e) {


    if( r.scrollingPage ){ return; } // while scrolling, ignore wheel-to-zoom

    var cy = r.cy;
    var pos = r.projectIntoViewport(e.clientX, e.clientY);
    var rpos = [pos[0] * cy.zoom() + cy.pan().x,
                  pos[1] * cy.zoom() + cy.pan().y];

    if( r.hoverData.draggingEles || r.hoverData.dragging || r.hoverData.cxtStarted || inBoxSelection() ){ // if pan dragging or cxt dragging, wheel movements make no zoom
      e.preventDefault();
      return;
    }

    if( cy.panningEnabled() && cy.userPanningEnabled() && cy.zoomingEnabled() && cy.userZoomingEnabled() ){
      e.preventDefault();

      r.data.wheelZooming = true;
      clearTimeout( r.data.wheelTimeout );
      r.data.wheelTimeout = setTimeout(function(){
        r.data.wheelZooming = false;

        r.redrawHint('eles', true);
        r.redraw();
      }, 150);

      var diff = e.deltaY / -250 || e.wheelDeltaY / 1000 || e.wheelDelta / 1000;
      diff = diff * r.wheelSensitivity;

      var needsWheelFix = e.deltaMode === 1;
      if( needsWheelFix ){ // fixes slow wheel events on ff/linux and ff/windows
        diff *= 33;
      }

      cy.zoom({
        level: cy.zoom() * Math.pow(10, diff),
        renderedPosition: { x: rpos[0], y: rpos[1] }
      });
    }

  };

  // Functions to help with whether mouse wheel should trigger zooming
  // --
  r.registerBinding(r.container, 'wheel', wheelHandler, true);

  // disable nonstandard wheel events
  // r.registerBinding(r.container, 'mousewheel', wheelHandler, true);
  // r.registerBinding(r.container, 'DOMMouseScroll', wheelHandler, true);
  // r.registerBinding(r.container, 'MozMousePixelScroll', wheelHandler, true); // older firefox

  r.registerBinding(window, 'scroll', function(e){
    r.scrollingPage = true;

    clearTimeout( r.scrollingPageTimeout );
    r.scrollingPageTimeout = setTimeout(function(){
      r.scrollingPage = false;
    }, 250);
  }, true);

  // Functions to help with handling mouseout/mouseover on the Cytoscape container
        // Handle mouseout on Cytoscape container
  r.registerBinding(r.container, 'mouseout', function(e) {
    var pos = r.projectIntoViewport(e.clientX, e.clientY);

    r.cy.trigger(Event(e, {
      type: 'mouseout',
      cyPosition: { x: pos[0], y: pos[1] }
    }));
  }, false);

  r.registerBinding(r.container, 'mouseover', function(e) {
    var pos = r.projectIntoViewport(e.clientX, e.clientY);

    r.cy.trigger(Event(e, {
      type: 'mouseover',
      cyPosition: { x: pos[0], y: pos[1] }
    }));
  }, false);

  var f1x1, f1y1, f2x1, f2y1; // starting points for pinch-to-zoom
  var distance1, distance1Sq; // initial distance between finger 1 and finger 2 for pinch-to-zoom
  var center1, modelCenter1; // center point on start pinch to zoom
  var offsetLeft, offsetTop;
  var containerWidth, containerHeight;
  var twoFingersStartInside;

  var distance = function(x1, y1, x2, y2){
    return Math.sqrt( (x2-x1)*(x2-x1) + (y2-y1)*(y2-y1) );
  };

  var distanceSq = function(x1, y1, x2, y2){
    return (x2-x1)*(x2-x1) + (y2-y1)*(y2-y1);
  };

  var touchstartHandler;
  r.registerBinding(r.container, 'touchstart', touchstartHandler = function(e) {
    r.touchData.capture = true;
    r.data.bgActivePosistion = undefined;

    var cy = r.cy;
    var nodes = r.getCachedNodes();
    var edges = r.getCachedEdges();
    var now = r.touchData.now;
    var earlier = r.touchData.earlier;

    if (e.touches[0]) { var pos = r.projectIntoViewport(e.touches[0].clientX, e.touches[0].clientY); now[0] = pos[0]; now[1] = pos[1]; }
    if (e.touches[1]) { var pos = r.projectIntoViewport(e.touches[1].clientX, e.touches[1].clientY); now[2] = pos[0]; now[3] = pos[1]; }
    if (e.touches[2]) { var pos = r.projectIntoViewport(e.touches[2].clientX, e.touches[2].clientY); now[4] = pos[0]; now[5] = pos[1]; }


    // record starting points for pinch-to-zoom
    if( e.touches[1] ){

      // anything in the set of dragged eles should be released
      var release = function( eles ){
        for( var i = 0; i < eles.length; i++ ){
          eles[i]._private.grabbed = false;
          eles[i]._private.rscratch.inDragLayer = false;
          if( eles[i].active() ){ eles[i].unactivate(); }
        }
      };
      release(nodes);
      release(edges);

      var offsets = r.findContainerClientCoords();
      offsetLeft = offsets[0];
      offsetTop = offsets[1];
      containerWidth = offsets[2];
      containerHeight = offsets[3];

      f1x1 = e.touches[0].clientX - offsetLeft;
      f1y1 = e.touches[0].clientY - offsetTop;

      f2x1 = e.touches[1].clientX - offsetLeft;
      f2y1 = e.touches[1].clientY - offsetTop;

      twoFingersStartInside =
           0 <= f1x1 && f1x1 <= containerWidth
        && 0 <= f2x1 && f2x1 <= containerWidth
        && 0 <= f1y1 && f1y1 <= containerHeight
        && 0 <= f2y1 && f2y1 <= containerHeight
      ;

      var pan = cy.pan();
      var zoom = cy.zoom();

      distance1 = distance( f1x1, f1y1, f2x1, f2y1 );
      distance1Sq = distanceSq( f1x1, f1y1, f2x1, f2y1 );
      center1 = [ (f1x1 + f2x1)/2, (f1y1 + f2y1)/2 ];
      modelCenter1 = [
        (center1[0] - pan.x) / zoom,
        (center1[1] - pan.y) / zoom
      ];

      // consider context tap
      var cxtDistThreshold = 200;
      var cxtDistThresholdSq = cxtDistThreshold * cxtDistThreshold;
      if( distance1Sq < cxtDistThresholdSq && !e.touches[2] ){

        var near1 = r.findNearestElement(now[0], now[1], true, true);
        var near2 = r.findNearestElement(now[2], now[3], true, true);

        if( near1 && near1.isNode() ){
          near1.activate().trigger( Event(e, {
            type: 'cxttapstart',
            cyPosition: { x: now[0], y: now[1] }
          }) );
          r.touchData.start = near1;

        } else if( near2 && near2.isNode() ){
          near2.activate().trigger( Event(e, {
            type: 'cxttapstart',
            cyPosition: { x: now[0], y: now[1] }
          }) );
          r.touchData.start = near2;

        } else {
          cy.trigger( Event(e, {
            type: 'cxttapstart',
            cyPosition: { x: now[0], y: now[1] }
          }) );
          r.touchData.start = null;
        }

        if( r.touchData.start ){ r.touchData.start._private.grabbed = false; }
        r.touchData.cxt = true;
        r.touchData.cxtDragged = false;
        r.data.bgActivePosistion = undefined;

        r.redraw();
        return;

      }

    }

    if (e.touches[2]) {

    } else if (e.touches[1]) {

    } else if (e.touches[0]) {
      var near = r.findNearestElement(now[0], now[1], true, true);

      if (near != null) {
        near.activate();

        r.touchData.start = near;

        if( near.isNode() && r.nodeIsDraggable(near) ){

          var draggedEles = r.dragData.touchDragEles = [];

          r.redrawHint('eles', true);
          r.redrawHint('drag', true);

          if( near.selected() ){
            // reset drag elements, since near will be added again

            var selectedNodes = cy.$(function(){
              return this.isNode() && this.selected();
            });

            for( var k = 0; k < selectedNodes.length; k++ ){
              var selectedNode = selectedNodes[k];

              if( r.nodeIsDraggable(selectedNode) ){
                addNodeToDrag( selectedNode, { addToList: draggedEles } );
              }
            }
          } else {
            addNodeToDrag( near, { addToList: draggedEles } );
          }

          near.trigger( Event(e, {
            type: 'grab',
            cyPosition: { x: now[0], y: now[1] }
          }) );
        }
      }

      triggerEvents( near, ['touchstart', 'tapstart', 'vmousedown'], e, {
        cyPosition: { x: now[0], y: now[1] }
      } );

      if (near == null) {
        r.data.bgActivePosistion = {
          x: pos[0],
          y: pos[1]
        };

        r.redrawHint('select', true);
        r.redraw();
      }


      // Tap, taphold
      // -----

      for (var i=0; i<now.length; i++) {
        earlier[i] = now[i];
        r.touchData.startPosition[i] = now[i];
      }

      r.touchData.singleTouchMoved = false;
      r.touchData.singleTouchStartTime = +new Date();

      clearTimeout( r.touchData.tapholdTimeout );
      r.touchData.tapholdTimeout = setTimeout(function() {
        if(
            r.touchData.singleTouchMoved === false
            && !r.pinching // if pinching, then taphold unselect shouldn't take effect
        ){
          triggerEvents( r.touchData.start, ['taphold'], e, {
            cyPosition: { x: now[0], y: now[1] }
          } );

          if (!r.touchData.start) {
            cy.$(':selected').unselect();
          }

        }
      }, r.tapholdDuration);
    }

  }, false);

  var touchmoveHandler;
  r.registerBinding(window, 'touchmove', touchmoveHandler = function(e) {

    var select = r.selection;
    var capture = r.touchData.capture;
    var cy = r.cy;
    var now = r.touchData.now; var earlier = r.touchData.earlier;
    var zoom = cy.zoom();

    if (e.touches[0]) { var pos = r.projectIntoViewport(e.touches[0].clientX, e.touches[0].clientY); now[0] = pos[0]; now[1] = pos[1]; }
    if (e.touches[1]) { var pos = r.projectIntoViewport(e.touches[1].clientX, e.touches[1].clientY); now[2] = pos[0]; now[3] = pos[1]; }
    if (e.touches[2]) { var pos = r.projectIntoViewport(e.touches[2].clientX, e.touches[2].clientY); now[4] = pos[0]; now[5] = pos[1]; }

    var disp = []; for (var j=0;j<now.length;j++) { disp[j] = now[j] - earlier[j]; }
    var startPos = r.touchData.startPosition;
    var dx = now[0] - startPos[0];
    var dx2 = dx * dx;
    var dy = now[1] - startPos[1];
    var dy2 = dy * dy;
    var dist2 = dx2 + dy2;
    var rdist2 = dist2 * zoom * zoom;

    // context swipe cancelling
    if( capture && r.touchData.cxt ){
      e.preventDefault();

      var f1x2 = e.touches[0].clientX - offsetLeft, f1y2 = e.touches[0].clientY - offsetTop;
      var f2x2 = e.touches[1].clientX - offsetLeft, f2y2 = e.touches[1].clientY - offsetTop;
      // var distance2 = distance( f1x2, f1y2, f2x2, f2y2 );
      var distance2Sq = distanceSq( f1x2, f1y2, f2x2, f2y2 );
      var factorSq = distance2Sq / distance1Sq;

      var distThreshold = 150;
      var distThresholdSq = distThreshold * distThreshold;
      var factorThreshold = 1.5;
      var factorThresholdSq = factorThreshold * factorThreshold;

      // cancel ctx gestures if the distance b/t the fingers increases
      if( factorSq >= factorThresholdSq || distance2Sq >= distThresholdSq ){
        r.touchData.cxt = false;
        if( r.touchData.start ){ r.touchData.start.unactivate(); r.touchData.start = null; }
        r.data.bgActivePosistion = undefined;
        r.redrawHint('select', true);

        var cxtEvt = Event(e, {
          type: 'cxttapend',
          cyPosition: { x: now[0], y: now[1] }
        });
        if( r.touchData.start ){
          r.touchData.start.trigger( cxtEvt );
        } else {
          cy.trigger( cxtEvt );
        }
      }

    }

    // context swipe
    if( capture && r.touchData.cxt ){
      var cxtEvt = Event(e, {
        type: 'cxtdrag',
        cyPosition: { x: now[0], y: now[1] }
      });
      r.data.bgActivePosistion = undefined;
      r.redrawHint('select', true);

      if( r.touchData.start ){
        r.touchData.start.trigger( cxtEvt );
      } else {
        cy.trigger( cxtEvt );
      }

      if( r.touchData.start ){ r.touchData.start._private.grabbed = false; }
      r.touchData.cxtDragged = true;

      var near = r.findNearestElement(now[0], now[1], true, true);

      if( !r.touchData.cxtOver || near !== r.touchData.cxtOver ){

        if( r.touchData.cxtOver ){
          r.touchData.cxtOver.trigger( Event(e, {
            type: 'cxtdragout',
            cyPosition: { x: now[0], y: now[1] }
          }) );
        }

        r.touchData.cxtOver = near;

        if( near ){
          near.trigger( Event(e, {
            type: 'cxtdragover',
            cyPosition: { x: now[0], y: now[1] }
          }) );

        }

      }

    // box selection
    } else if( capture && e.touches[2] && cy.boxSelectionEnabled() ){
      e.preventDefault();

      r.data.bgActivePosistion = undefined;

      this.lastThreeTouch = +new Date();
      r.touchData.selecting = true;

      r.redrawHint('select', true);

      if( !select || select.length === 0 || select[0] === undefined ){
        select[0] = (now[0] + now[2] + now[4])/3;
        select[1] = (now[1] + now[3] + now[5])/3;
        select[2] = (now[0] + now[2] + now[4])/3 + 1;
        select[3] = (now[1] + now[3] + now[5])/3 + 1;
      } else {
        select[2] = (now[0] + now[2] + now[4])/3;
        select[3] = (now[1] + now[3] + now[5])/3;
      }

      select[4] = 1;
      r.touchData.selecting = true;

      r.redraw();

    // pinch to zoom
    } else if ( capture && e.touches[1] && cy.zoomingEnabled() && cy.panningEnabled() && cy.userZoomingEnabled() && cy.userPanningEnabled() ) { // two fingers => pinch to zoom
      e.preventDefault();

      r.data.bgActivePosistion = undefined;
      r.redrawHint('select', true);

      var draggedEles = r.dragData.touchDragEles;
      if( draggedEles ){
        r.redrawHint('drag', true);

        for( var i = 0; i < draggedEles.length; i++ ){
          draggedEles[i]._private.grabbed = false;
          draggedEles[i]._private.rscratch.inDragLayer = false;
        }
      }

      // (x2, y2) for fingers 1 and 2
      var f1x2 = e.touches[0].clientX - offsetLeft, f1y2 = e.touches[0].clientY - offsetTop;
      var f2x2 = e.touches[1].clientX - offsetLeft, f2y2 = e.touches[1].clientY - offsetTop;


      var distance2 = distance( f1x2, f1y2, f2x2, f2y2 );
      // var distance2Sq = distanceSq( f1x2, f1y2, f2x2, f2y2 );
      // var factor = Math.sqrt( distance2Sq ) / Math.sqrt( distance1Sq );
      var factor = distance2 / distance1;

      if( factor != 1 && twoFingersStartInside){
        // delta finger1
        var df1x = f1x2 - f1x1;
        var df1y = f1y2 - f1y1;

        // delta finger 2
        var df2x = f2x2 - f2x1;
        var df2y = f2y2 - f2y1;

        // translation is the normalised vector of the two fingers movement
        // i.e. so pinching cancels out and moving together pans
        var tx = (df1x + df2x)/2;
        var ty = (df1y + df2y)/2;

        // adjust factor by the speed multiplier
        // var speed = 1.5;
        // if( factor > 1 ){
        //   factor = (factor - 1) * speed + 1;
        // } else {
        //   factor = 1 - (1 - factor) * speed;
        // }

        // now calculate the zoom
        var zoom1 = cy.zoom();
        var zoom2 = zoom1 * factor;
        var pan1 = cy.pan();

        // the model center point converted to the current rendered pos
        var ctrx = modelCenter1[0] * zoom1 + pan1.x;
        var ctry = modelCenter1[1] * zoom1 + pan1.y;

        var pan2 = {
          x: -zoom2/zoom1 * (ctrx - pan1.x - tx) + ctrx,
          y: -zoom2/zoom1 * (ctry - pan1.y - ty) + ctry
        };

        // remove dragged eles
        if( r.touchData.start ){
          var draggedEles = r.dragData.touchDragEles;

          if( draggedEles ){ for( var i = 0; i < draggedEles.length; i++ ){
            var dEi_p = draggedEles[i]._private;

            dEi_p.grabbed = false;
            dEi_p.rscratch.inDragLayer = false;
          } }

          var start_p = r.touchData.start._private;
          start_p.active = false;
          start_p.grabbed = false;
          start_p.rscratch.inDragLayer = false;

          r.redrawHint('drag', true);

          r.touchData.start
            .trigger('free')
            .trigger('unactivate')
          ;
        }

        cy.viewport({
          zoom: zoom2,
          pan: pan2,
          cancelOnFailedZoom: true
        });

        distance1 = distance2;
        f1x1 = f1x2;
        f1y1 = f1y2;
        f2x1 = f2x2;
        f2y1 = f2y2;

        r.pinching = true;
      }

      // Re-project
      if (e.touches[0]) { var pos = r.projectIntoViewport(e.touches[0].clientX, e.touches[0].clientY); now[0] = pos[0]; now[1] = pos[1]; }
      if (e.touches[1]) { var pos = r.projectIntoViewport(e.touches[1].clientX, e.touches[1].clientY); now[2] = pos[0]; now[3] = pos[1]; }
      if (e.touches[2]) { var pos = r.projectIntoViewport(e.touches[2].clientX, e.touches[2].clientY); now[4] = pos[0]; now[5] = pos[1]; }

    } else if (e.touches[0]) {
      var start = r.touchData.start;
      var last = r.touchData.last;
      var near = near || r.findNearestElement(now[0], now[1], true, true);

      if( start != null ){
        e.preventDefault();
      }

      // dragging nodes
      if( start != null && start._private.group == 'nodes' && r.nodeIsDraggable(start) ){

        if( rdist2 >= r.touchTapThreshold2 ){ // then dragging can happen
          var draggedEles = r.dragData.touchDragEles;
          var justStartedDrag = !r.dragData.didDrag;

          for( var k = 0; k < draggedEles.length; k++ ){
            var draggedEle = draggedEles[k];

            if( justStartedDrag ){
              addNodeToDrag( draggedEle, { inDragLayer: true } );
            }

            if( r.nodeIsDraggable(draggedEle) && draggedEle.isNode() && draggedEle.grabbed() ){
              r.dragData.didDrag = true;
              var dPos = draggedEle._private.position;
              var updatePos = !draggedEle.isParent();

              if( updatePos && is.number(disp[0]) && is.number(disp[1]) ){
                dPos.x += disp[0];
                dPos.y += disp[1];
              }

              if( justStartedDrag ){
                r.redrawHint('eles', true);

                var dragDelta = r.touchData.dragDelta;

                if( updatePos && is.number(dragDelta[0]) && is.number(dragDelta[1]) ){
                  dPos.x += dragDelta[0];
                  dPos.y += dragDelta[1];
                }

              }
            }
          }

          var tcol = Collection(cy, draggedEles);

          tcol.updateCompoundBounds();
          tcol.trigger('position drag');

          r.hoverData.draggingEles = true;

          r.redrawHint('drag', true);

          if(
               r.touchData.startPosition[0] == earlier[0]
            && r.touchData.startPosition[1] == earlier[1]
          ){

            r.redrawHint('eles', true);
          }

          r.redraw();
        } else { // otherise keep track of drag delta for later
          var dragDelta = r.touchData.dragDelta = r.touchData.dragDelta || [];

          if( dragDelta.length === 0 ){
            dragDelta.push( disp[0] );
            dragDelta.push( disp[1] );
          } else {
            dragDelta[0] += disp[0];
            dragDelta[1] += disp[1];
          }
        }
      }

      // touchmove
      {
        triggerEvents( (start || near), ['touchmove', 'tapdrag', 'vmousemove'], e, {
          cyPosition: { x: now[0], y: now[1] }
        } );

        if (near != last) {
          if (last) { last.trigger(Event(e, { type: 'tapdragout', cyPosition: { x: now[0], y: now[1] } })); }
          if (near) { near.trigger(Event(e, { type: 'tapdragover', cyPosition: { x: now[0], y: now[1] } })); }
        }

        r.touchData.last = near;
      }

      // check to cancel taphold
      for (var i=0;i<now.length;i++) {
        if( now[i]
          && r.touchData.startPosition[i]
          && rdist2 > r.touchTapThreshold2 ){

          r.touchData.singleTouchMoved = true;
        }
      }

      // panning
      if(
          capture
          && ( start == null || start.isEdge() )
          && cy.panningEnabled() && cy.userPanningEnabled()
      ){

        e.preventDefault();

        if( r.swipePanning ){
          cy.panBy({
            x: disp[0] * zoom,
            y: disp[1] * zoom
          });

        } else if( rdist2 >= r.touchTapThreshold2 ){
          r.swipePanning = true;

          cy.panBy({
            x: dx * zoom,
            y: dy * zoom
          });

          if( start ){
            start.unactivate();

            if( !r.data.bgActivePosistion ){
              r.data.bgActivePosistion = {
                x: now[0],
                y: now[1]
              };
            }

            r.redrawHint('select', true);

            r.touchData.start = null;
          }
        }

        // Re-project
        var pos = r.projectIntoViewport(e.touches[0].clientX, e.touches[0].clientY);
        now[0] = pos[0]; now[1] = pos[1];
      }
    }

    for (var j=0; j<now.length; j++) { earlier[j] = now[j]; }
    //r.redraw();

  }, false);

  var touchcancelHandler;
  r.registerBinding(window, 'touchcancel', touchcancelHandler = function(e) {
    var start = r.touchData.start;

    r.touchData.capture = false;

    if( start ){
      start.unactivate();
    }
  });

  var touchendHandler;
  r.registerBinding(window, 'touchend', touchendHandler = function(e) {
    var start = r.touchData.start;

    var capture = r.touchData.capture;

    if( capture ){
      r.touchData.capture = false;

      e.preventDefault();
    } else {
      return;
    }

    var select = r.selection;

    r.swipePanning = false;
    r.hoverData.draggingEles = false;

    var cy = r.cy;
    var zoom = cy.zoom();
    var now = r.touchData.now;
    var earlier = r.touchData.earlier;

    if (e.touches[0]) { var pos = r.projectIntoViewport(e.touches[0].clientX, e.touches[0].clientY); now[0] = pos[0]; now[1] = pos[1]; }
    if (e.touches[1]) { var pos = r.projectIntoViewport(e.touches[1].clientX, e.touches[1].clientY); now[2] = pos[0]; now[3] = pos[1]; }
    if (e.touches[2]) { var pos = r.projectIntoViewport(e.touches[2].clientX, e.touches[2].clientY); now[4] = pos[0]; now[5] = pos[1]; }

    if( start ){
      start.unactivate();
    }

    var ctxTapend;
    if( r.touchData.cxt ){
      ctxTapend = Event(e, {
        type: 'cxttapend',
        cyPosition: { x: now[0], y: now[1] }
      });

      if( start ){
        start.trigger( ctxTapend );
      } else {
        cy.trigger( ctxTapend );
      }

      if( !r.touchData.cxtDragged ){
        var ctxTap = Event(e, {
          type: 'cxttap',
          cyPosition: { x: now[0], y: now[1] }
        });

        if( start ){
          start.trigger( ctxTap );
        } else {
          cy.trigger( ctxTap );
        }

      }

      if( r.touchData.start ){ r.touchData.start._private.grabbed = false; }
      r.touchData.cxt = false;
      r.touchData.start = null;

      r.redraw();
      return;
    }

    // no more box selection if we don't have three fingers
    if( !e.touches[2] && cy.boxSelectionEnabled() && r.touchData.selecting ){
      r.touchData.selecting = false;

      var newlySelected = [];
      var box = r.getAllInBox( select[0], select[1], select[2], select[3] );

      select[0] = undefined;
      select[1] = undefined;
      select[2] = undefined;
      select[3] = undefined;
      select[4] = 0;

      r.redrawHint('select', true);

      for( var i = 0; i< box.length; i++ ) {
        if( box[i]._private.selectable ){
          newlySelected.push( box[i] );
        }
      }

      var newlySelCol = Collection( cy, newlySelected );

      newlySelCol.select();

      if( newlySelCol.length > 0 ) {
        r.redrawHint('eles', true);
      } else {
        r.redraw();
      }
    }

    var updateStartStyle = false;

    if( start != null ){
      start._private.active = false;
      updateStartStyle = true;
      start.unactivate();
    }

    if (e.touches[2]) {
      r.data.bgActivePosistion = undefined;
      r.redrawHint('select', true);
    } else if (e.touches[1]) {

    } else if (e.touches[0]) {

    // Last touch released
    } else if (!e.touches[0]) {

      r.data.bgActivePosistion = undefined;
      r.redrawHint('select', true);

      var draggedEles = r.dragData.touchDragEles;

      if (start != null ) {

        var startWasGrabbed = start._private.grabbed;

        freeDraggedElements( draggedEles );

        r.redrawHint('drag', true);
        r.redrawHint('eles', true);

        if( startWasGrabbed ){
          start.trigger('free');
        }

        triggerEvents( start, ['touchend', 'tapend', 'vmouseup'], e, {
          cyPosition: { x: now[0], y: now[1] }
        } );

        start.unactivate();

        r.touchData.start = null;

      } else {
        var near = r.findNearestElement(now[0], now[1], true, true);

        triggerEvents( near, ['touchend', 'tapend', 'vmouseup'], e, {
          cyPosition: { x: now[0], y: now[1] }
        } );

      }

      var dx = r.touchData.startPosition[0] - now[0];
      var dx2 = dx * dx;
      var dy = r.touchData.startPosition[1] - now[1];
      var dy2 = dy * dy;
      var dist2 = dx2 + dy2;
      var rdist2 = dist2 * zoom * zoom;

      // Prepare to select the currently touched node, only if it hasn't been dragged past a certain distance
      if (start != null
          && !r.dragData.didDrag // didn't drag nodes around
          && start._private.selectable
          && rdist2 < r.touchTapThreshold2
          && !r.pinching // pinch to zoom should not affect selection
      ) {

        if( cy.selectionType() === 'single' ){
          cy.$(':selected').unmerge( start ).unselect();
          start.select();
        } else {
          if( start.selected() ){
            start.unselect();
          } else {
            start.select();
          }
        }

        updateStartStyle = true;


        r.redrawHint('eles', true);
      }

      // Tap event, roughly same as mouse click event for touch
      if( !r.touchData.singleTouchMoved ){
        triggerEvents( start, ['tap', 'vclick'], e, {
          cyPosition: { x: now[0], y: now[1] }
        } );
      }

      r.touchData.singleTouchMoved = true;
    }

    for( var j = 0; j < now.length; j++ ){ earlier[j] = now[j]; }

    r.dragData.didDrag = false; // reset for next mousedown

    if( e.touches.length === 0 ){
      r.touchData.dragDelta = [];
    }

    if( updateStartStyle && start ){
      start.updateStyle(false);
    }

    if( e.touches.length < 2 ){
      r.pinching = false;
      r.redrawHint('eles', true);
      r.redraw();
    }

    //r.redraw();

  }, false);

  // fallback compatibility layer for ms pointer events
  if( typeof TouchEvent === 'undefined' ){

    var pointers = [];

    var makeTouch = function( e ){
      return {
        clientX: e.clientX,
        clientY: e.clientY,
        force: 1,
        identifier: e.pointerId,
        pageX: e.pageX,
        pageY: e.pageY,
        radiusX: e.width/2,
        radiusY: e.height/2,
        screenX: e.screenX,
        screenY: e.screenY,
        target: e.target
      };
    };

    var makePointer = function( e ){
      return {
        event: e,
        touch: makeTouch(e)
      };
    };

    var addPointer = function( e ){
      pointers.push( makePointer(e) );
    };

    var removePointer = function( e ){
      for( var i = 0; i < pointers.length; i++ ){
        var p = pointers[i];

        if( p.event.pointerId === e.pointerId ){
          pointers.splice( i, 1 );
          return;
        }
      }
    };

    var updatePointer = function( e ){
      var p = pointers.filter(function( p ){
        return p.event.pointerId === e.pointerId;
      })[0];

      p.event = e;
      p.touch = makeTouch(e);
    };

    var addTouchesToEvent = function( e ){
      e.touches = pointers.map(function( p ){
        return p.touch;
      });
    };

    r.registerBinding(r.container, 'pointerdown', function(e){
      if( e.pointerType === 'mouse' ){ return; } // mouse already handled

      e.preventDefault();

      addPointer( e );

      addTouchesToEvent( e );
      touchstartHandler( e );
    });

    r.registerBinding(r.container, 'pointerup', function(e){
      if( e.pointerType === 'mouse' ){ return; } // mouse already handled

      removePointer( e );

      addTouchesToEvent( e );
      touchendHandler( e );
    });

    r.registerBinding(r.container, 'pointercancel', function(e){
      if( e.pointerType === 'mouse' ){ return; } // mouse already handled

      removePointer( e );

      addTouchesToEvent( e );
      touchcancelHandler( e );
    });

    r.registerBinding(r.container, 'pointermove', function(e){
      if( e.pointerType === 'mouse' ){ return; } // mouse already handled

      e.preventDefault();

      updatePointer( e );

      addTouchesToEvent( e );
      touchmoveHandler( e );
    });

  }
};

module.exports = BRp;
