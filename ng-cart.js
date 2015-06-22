angular.module('services.cart', [])
    .service('Reviewer', ['$rootScope', function($rootScope) {
        this.review = function(cart) {
            /**
             * The review routine goes here (not part of scope as of now)
             */
            return {
                then: function(success, failure) {
                    success.apply(cart);
                }
            };
        };
    }]);

angular.module('services.cart')
    .service('Cart', ['$rootScope', 'Reviewer', function ($rootScope, Reviewer) {
        /**
         * Declaring variables privately
         */
        var eventStack  = [];

        /**
         * The errors dictionary
         * @type {Object}
         */
        var errors = {
            itemsNotArray: 'Argument should be of type Array',
            idMandatory: 'Item id missing'
        };

        /**
         * Our storage object: wrapper for localStorage
         * @type {Object}
         */
        var storage = {
            /**
             * The key for localStorage under which to store the cart details
             * @type {String}
             */
            key: 'cart',

            /**
             * Collection of all items in the cart
             * @type {Array}
             */
            allItems: [],

            /**
             * Store the items in localStorage
             * @param  {Object} obj JSON object with item details
             * @return {Void}    
             */
            save: function(obj) {
                localStorage.setItem(this.key, angular.toJson(obj));
            },

            /**
             * Fetch items from localStorage, into the cart object
             * @return {Void}
             */
            fetch: function() {
                var fromLocalStorage = localStorage.getItem(this.key);
                if (fromLocalStorage && fromLocalStorage.length) {
                    return angular.fromJson(fromLocalStorage);
                } else {
                    return [];
                }
            },

            /**
             * Persist the cart and fire appropriate event
             * @return {Void}
             */
            persist: function() {
                this.save(this.allItems);
                cart.fireCustomEvent('persisted');
            },

            /**
             * Clear the cart
             * @return {Void}
             */
            clear: function() {
                this.save([]);
            }
        };
        
        /**
         * Initialize the cart
         * @return {Void}
         */
        var init = function() {
            /**
             * Add an event to persist the cart each time it is modified
             */
            this.onEvent('sys-modified', function(items) {
                storage.allItems = items;
                
                /**
                 * Notify the app about cart modifications
                 */
                cart.refresh(items);
                
                /**
                 * Save the cart
                 */
                cart.save();
            });

            this.fireCustomEvent('initialized');
        }

        /**
         * Storing a reference to self
         * @type {Object}
         */
        var cart = this;
        
        /**
         * Get items currently in the cart
         * @param  {Function} cb Function to run after getting the items
         * @return {Object}      Containing array of items & promise-mock
         */
        cart.getCart = function(cb) {
            var items = storage.fetch();
            /**
             * If cb is passed, execute it in the cart's scope
             */
            (cb || angular.noop).apply(cart, [items]);

            /**
             * Let's return a 'then' for those who're willing to avoid the potential callback hell
             */
            return {
                items: items,
                then: function(then) {
                    then.apply(cart, [items]);
                }
            };
        };

        cart.addItem = function(id, qty) {
            qty = qty || 1; //default qty

            /**
             * id is mandatory
             */
            if (!angular.isDefined(id)) {
                throw new Error(errors['idMandatory']);
            }
            /**
             * Direct it to addItems for a singular implementation (this is a convenience method)
             */
            return cart.addItems([
                {
                    id: id,
                    qty: qty
                }
            ]);
        };

        cart.addItems = function(items) {
            /**
             * Argument should be an array
             */
            if (!angular.isArray(items)) {
                throw new Error(errors['itemsNotArray']);
            }

            var cartItems = cart.getCart().items;
            
            /**
             * Let's loop through each item (because we cannot just concat the arrays, we need to check for existing items)
             */
            angular.forEach(items, function(item, idx) {
                /**
                 * Does the item exist already?
                 */
                var existing = cart.getById(item.id, cartItems); //pass the cartItems to it, so it does not ping the storage each time

                /**
                 * If it exists, just increment its qty
                 */
                if (existing.index !== -1) {
                    cartItems[existing.index].qty += item.qty;
                } else {
                    cartItems.push(item);
                }
                cart.fireCustomEvent('modified added sys-modified', cartItems);
            });
            
            return cartItems;
        };

        /**
         * Save the cart into storage
         * @return {Promise} The promise that is reviewing the cart
         */
        cart.save = function() {
            /**
             * Persist data on each modification, if review passes
             */
            var reviewPromise = Reviewer.review(cart);
            reviewPromise.then(function(response) {
                storage.persist(this);
            }, function(err) {
                throw err;
            });
            return reviewPromise;
        };

        /**
         * Fetches an item by its id, and accepts a callback
         * @param  {Number}   id        The id of item needed
         * @param  {Array} itemsToUse   If this function is to be called multiple times, the items array can be passed to it
         * @return {Void}
         */
        cart.getById = function(id, itemsToUse) {
            var cartItems = itemsToUse || cart.getCart().items; //else take from storage
            var idx = -1;
            var filteredItems = cartItems;
            filteredItems = filteredItems.filter(function(item, index) {
                if (item.id === id) {
                    idx = index;
                    return true;
                }
            });

            return {
                item: filteredItems.pop(),
                index: idx
            };
        };

        /**
         * Remove a specific item from the cart by its id
         * @param  {Number} id The id of the item
         * @return {Void}
         */
        cart.remove = function(id) {
            var result = cart.getById(id);
            var cartItems = cart.getCart().items;

            if (result.index !== -1) {
                cartItems.splice(result.index, 1);
                cart.fireCustomEvent('modified removed sys-modified', cartItems);
                return true;
            }
            return false;
        };

        /**
         * Clear all items from the cart
         * @return {Void}
         */
        cart.clear = function() {
            cart.fireCustomEvent('modified removed cleared sys-modified', []); //pass in an empty array, persistence will take care of clearing it
        };

        /**
         * Change quantity of an existing item
         * @param  {Number} id  The id of the item
         * @param  {Number} qty Updated quantity value
         * @return {Void}     
         */
        cart.changeQuantity = function(id, qty, cb) {
            var cartItems = cart.getCart().items;
            var result = cart.getById(id);

            if (result.index !== -1) {
                var updatedItem = result.item;
                updatedItem.qty = qty;
                cartItems.splice(result.index, 1, updatedItem); //replace old item with the new updated one
                cart.fireCustomEvent('modified updated sys-modified', cartItems);
                (cb || angular.noop)(cartItems);
                return true;
            } else {
                return false;
            }
        };

        /**
         * Broadcast cart updates across the application
         * @param  {Array} items Items currently in the cart during the refresh
         * @return {Void}
         */
        cart.refresh = function(items) {
            /**
             * Broadcast to the app
             */
            $rootScope.$broadcast('cart-modified', items);
        };

        /**
         * Add a basic event
         * @param  {String}   type The type of event to be added
         * @param  {Function} fn   The function to execute when this event-type is triggered
         * @return {Void}
         */
        cart.onEvent = function(type, fn) {
            eventStack.push({type: type, fn: fn});
        };

        /**
         * Fire an event
         * @param  {String} type Type of event to be fired
         * @param  {Object} data The data to be passed to the event handlers bound to the event
         * @return {Void}
         */
        cart.fireCustomEvent = function(type, data) {
            var eventTypes = type.split(' ');
            for (var i in eventStack) {
                (eventTypes.indexOf(eventStack[i].type) !== -1) && (eventStack[i].ran = 'already' && eventStack[i].fn(data));
            }
        };

        /**
         * Unbind existing events based on their type
         * @param  {String} type The type of event to remove binding for
         * @return {Void}
         */
        cart.unbindEvent = function(type) {
            for (var i in eventStack) {
                (eventStack[i].type === type) && (eventStack.splice(i, 1));
            }
        }

        /**
         * Initialize the cart object
         */
        init.apply(cart);

    }]);


angular.module('services.cart')
    .controller('Store', ['Cart', '$scope', function(Cart, $scope) {
        $scope.$on('cart-modified', function(e, items) {
            console.log("Now there are " + items.length + " item(s) in the cart.");
        });
        $scope.consoleOutput = function() {
            console.log(Cart.getCart().items);
        }
        $scope.unbindModifiedEvent = function() {
            Cart.unbindEvent('modified');
        }
        $scope.changeQty = function() {
            Cart.changeQuantity(2, 10);
        }
        $scope.clearAll = function() {
            Cart.clear();
        }
        $scope.removeSample = function() {
            Cart.remove(1);
        }
        $scope.addMockData = function() {
            Cart.addItems([
                {
                    id: 1,
                    qty: 100
                }, {
                    id: 2,
                    qty: 100
                }
            ]);

            Cart.addItem(3); //default qty is 1
        };

        Cart.onEvent('modified', function() {
            console.log('Custom event running on being modified.');
        });
        Cart.getCart().then(function(items) {
            console.log("At load, we have " + items.length + " item(s).");
        });
    }]);