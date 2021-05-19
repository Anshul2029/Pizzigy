if (document.readyState == "loading") {
  document.addEventListener("DOMContentLoaded", ready);
} else {
  ready();
}

function ready() {
  var removeCartItemButtons = document.getElementsByClassName("item-btn");
  for (var i = 0; i < removeCartItemButtons.length; i++) {
    var button = removeCartItemButtons[i];
    button.addEventListener("click", removeCartItem);
  }

  var plusButtons = document.getElementsByClassName("plus-button");
  for (var i = 0; i < plusButtons.length; i++) {
    var button = plusButtons[i];
    button.addEventListener("click", plusButton);
  }

  var minusButtons = document.getElementsByClassName("minus-button");
  for (var i = 0; i < minusButtons.length; i++) {
    var button = minusButtons[i];
    button.addEventListener("click", minusButton);
  }

  var quantityInputs = document.getElementsByClassName("cart-quantity-input");
  for (var i = 0; i < quantityInputs.length; i++) {
    var input = quantityInputs[i];
    input.addEventListener("change", quantityChanged);
  }

  updateTotal();
}

function updateTotal() {
  const mainContainer = document.getElementsByClassName("shopping-cart")[0];
  const Items = mainContainer.getElementsByClassName("item-content");
  let totalPrice = 0;
  for (let i = 0; i < Items.length; i++) {
    const itemRow = Items[i];
    const inp = itemRow.getElementsByClassName("cart-quantity-input")[0];
    const itemCnt = parseInt(inp.value);
    const originalItem = itemRow.getElementsByClassName("original-item")[0];
    let itemPrice = originalItem.getElementsByClassName("item-price")[0];
    itemPrice = itemPrice.innerHTML.substr(2);
    itemPrice = parseFloat(itemPrice);
    totalPrice = totalPrice + itemCnt * itemPrice;
  }
  const billContainer = document.getElementsByClassName("bill-container")[0];
  const totalBill = billContainer.getElementsByClassName("total-bill")[0];
  totalBill.innerHTML = `Rs ${totalPrice}`;
}

function removeCartItem(event) {
  var button = event.target;
  button.parentElement.parentElement.remove();
  updateTotal();
}

function quantityChanged(event) {
  var input = event.target;
  if (isNaN(input.value) || input.value <= 0) {
    input.value = 1;
  }
  updateTotal();
}

function plusButton(event) {
  const plusIcon = event.target;
  const buttonParent = plusIcon.parentElement.parentElement;
  const inp = buttonParent.getElementsByClassName("cart-quantity-input")[0];
  let itemCnt = parseFloat(inp.value) + 1;
  inp.value = itemCnt.toString();
  updateTotal();
}

function minusButton(event) {
  const minusIcon = event.target;
  const buttonParent = minusIcon.parentElement.parentElement;
  const inp = buttonParent.getElementsByClassName("cart-quantity-input")[0];
  let itemCnt = parseFloat(inp.value) - 1;
  itemCnt = itemCnt <= 0 || isNaN(itemCnt) ? 1 : itemCnt;
  inp.value = itemCnt.toString();
  updateTotal();
}
// surendra
