var _init = function(weiqi){

  weiqi.Board = Backbone.Model.extend({
    defaults: {
      width: 19,
      move_count:0,
      last_played: null,
      white_stones: 3,
      black_stones: 3
    },

    get_cell: function(x, y) {
      if(x < this.get('width') && y < this.get('width')){
        return this.cells[x][y];
      }
      else {
        throw new Error("attempting to accessing outside of game board");
      }
    },

    remove_dead_groups: function(cell_just_played) {
      var dead_groups = _.select(this.stone_cell_groups(), function(group) { return group.is_dead() } );

      //don't kill just played piece just yet
      var potential_suicide = _.detect(dead_groups, function(group) { return _.include(group.stone_cells, cell_just_played) });
      if (potential_suicide) {
        dead_groups = _.reject(dead_groups, function(group) { return _.include(group.stone_cells, cell_just_played) });
      }

      _.each(
        dead_groups,
        function(dead_group) {
          dead_group.remove_stones();
        }
      );

      // If attacking group is still dead after removing any
      // dead stones, remove it
      if (potential_suicide && potential_suicide.is_dead()){
        potential_suicide.remove_stones();
      }
    },

    /* return all stones in their connected groups */
    stone_cell_groups: function() {
      var groups = []
      _.each(this.stone_cells(), function(stone_cell) {
        var adjacent_groups = _.select(groups, function(group) {
          return group.is_connected_to(stone_cell);
        });

        //Temporarily remove any groups connected to this stone_cell
        groups = _.reject(groups, function(group) {
          return group.is_connected_to(stone_cell);
        });

        //Combine all adjacent groups with this stone
        var combined_group = _.reduce(adjacent_groups, function(a, b) { return a.merge(b) }, new weiqi.Board.Group([stone_cell]));

        //Add those groups plus the new stone_cell back in as a single group
        groups.push(combined_group)
      });

      return groups;
    },

    update_cells: function(cells_attributes) {
      for(var x = 0; x < this.get('width'); x++){
        for(var y = 0; y < this.get('width'); y++){
          this.cells[x][y].set(cells_attributes[x][y]);
        }
      }
    },

    parse: function(attributes) {
      this.update_cells(attributes['cells']);
      this.moves.reset(attributes['moves']);
      return attributes;
    },
    whose_turn: function() {
      //black goes first
      if (this.get("last_played") == undefined || this.get("last_played") == "white") {
        return "black";
      } else {
        return "white";
      }
    },
    replenish: function(self, color) {
      console.log("OMG")

      //lets jank
      if (self.get('white_stones') < 3 && color == 'white') {
        self.set({ white_stones: self.get('white_stones') + 1})
        console.log("replenished white" + self.get('white_stones'))
        if (self.get('white_stones') < 3)
          setTimeout(function () { self.replenish(self,color) }, 5000)
      }

      if (self.get('black_stones') < 3 && color == 'black') {
        self.set({ black_stones: self.get('black_stones') + 1 })
        console.log("replenished black" + self.get('black_stones'))
        if (self.get('black_stones') < 3)
          setTimeout(function () { self.replenish(self,color) }, 5000)
      }
    },
    play: function(color, x, y, is_server) {

      var self = this
      var move = new weiqi.Move({x: x, y: y, color: color, num: this.moves.length});

      if (!is_server) {
        if (color == "white" && this.get('white_stones') < 1)
          throw new weiqi.IllegalMoveError("White out of stones.")

        if (color == "black" && this.get('black_stones') < 1)
          throw new weiqi.IllegalMoveError("Black out of stones.")

        if (this.moves.is_same_as_last_move(move))
          throw new weiqi.IllegalMoveError("Forbidden by the rule of ko.")

        if (this.get_cell(x, y).play(color)) {

          if (!is_server) {
            // Modify number of playable stones
            if (color == "white") {
              console.log("WTF")
              this.set({white_stones: this.get('white_stones') - 1})
              if (this.get('white_stones') == 2)
                setTimeout(function () { self.replenish(self, 'white') }, 5000)
            } else if (color == "black") {
              this.set({black_stones: this.get('black_stones') - 1})
              if (this.get('black_stones') == 2)
                setTimeout(function () { self.replenish(self, 'black') }, 5000)
            }
          }
        }
      }

      this.moves.add(move);
      var cells_attr = this.get('cells');
      cells_attr[x][y].holds = color;
      this.set({
        cells: cells_attr,
        last_played: color,
        move_count: this.get('move_count') + 1
      });

      this.remove_dead_groups(this.get_cell(x,y));

      return move.save()
    },
    play_black: function(x,y) {
      return this.play("black", x, y);
    },
    play_white: function(x,y) {
      return this.play("white", x, y);
    },
    stone_cells: function() {
      return _.reject(_.flatten(this.cells), function(cell) { return cell.is_empty() });
    },
    clear: function() {
      _.each(this.cells, function(column) {
        _.each(column, function(cell) {
          cell.set('holds', null);
        });
      });
      this.set('cells', this.blank_board(this.get('width')));
      this.set('move_count', 0);
      this.set('last_played', null);
      this.moves.reset();
    },
    width: function() {
      return this.get('width');
    },
    initialize: function(attributes, options) {
      options || (options = {});
      this.player_id = options.player_id;

      if( this.get('cells') == undefined ) {
        this.set({cells: this.blank_board(this.get('width'))},
                 {silent: true});
      }

      //Instantiate cell models from boards cell attributes
      this.cells = [];
      for(var x = 0; x < this.get('width'); x++){
        this.cells[x] = [];
        for(var y = 0; y < this.get('width'); y++){
          this.cells[x][y] = new weiqi.Cell(_.extend({board: this}, this.get('cells')[x][y]));
        }
      }

      if( this.get('moves') == undefined ) {
        this.set({ moves: [] }, { silent: true });
      }
      this.moves = new weiqi.MoveCollection(this.get('moves'), { board: this });
    },
    blank_board: function(width) {
      var cells = [];
      for(var x = 0; x < width; x++){
        cells[x] = [];
        for(var y = 0; y < width; y++){
          cells[x][y] = {x: x, y: y, holds: null};
        }
      }
      return cells;
    },
    url: function(){
      return this.urlRoot + '/' + this.player_id + '.' + 'json';
    },
    invitation_url: function() {
      return "/invitations/" + this.get('invitation_id');
    },
    urlRoot: '/boards'

  });

  function get_origin_from_location(location) {
    return
  }

  // Helper class for computing liberties
  weiqi.Board.Group = Backbone.Model.extend({
    constructor: function(stone_cells) {
      this.stone_cells = stone_cells;
    },

    //Any group which has a stone with an empty adjacent cell is alive.
    is_alive: function() {
      return _.detect(this.stone_cells, function(stone_cell) {
        return _.detect(stone_cell.adjacent_cells(), function(adjacent_cell) {
          return adjacent_cell.is_empty();
        }) != null;
      }) != null;
    },

    is_connected_to: function(foreign_stone_cell) {
      return _.detect(this.stone_cells, function(group_stone_cell) {
        // Stones are in the same group if they are the same color and adjacent
        return group_stone_cell.get('holds') == foreign_stone_cell.get('holds')
        && group_stone_cell.is_adjacent_to(foreign_stone_cell)
      }) != null;
    },

    is_dead: function() {
      return !this.is_alive();
    },

    merge: function(other_group) {
      return new weiqi.Board.Group(this.stone_cells.concat(other_group.stone_cells));
    },

    remove_stones: function() {
      _.each(this.stone_cells, function(stone_cell) {
        stone_cell.set({ holds: null });
        var cells_attr = stone_cell.board.get('cells');
        cells_attr[stone_cell.get('x')][stone_cell.get('y')].holds = null;
        stone_cell.board.set({ cells: cells_attr });
      });
    },
  });

  return weiqi
}

if(typeof exports === "undefined"){
  this['weiqi'] = this['weiqi'] || {};
  weiqi = _init(weiqi)
}
else
  module.exports = _init;
