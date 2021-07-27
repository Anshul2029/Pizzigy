require("dotenv").config();
var express = require("express");
var mongoose = require("mongoose");
var body = require("body-parser");
var app = express();
var session = require("express-session");
var sessionstorage = require("node-sessionstorage");
const { ObjectId } = require("mongoose").Schema;
var nodemailer = require("nodemailer");
var sendgridtransport = require("nodemailer-sendgrid-transport");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const RESET_LINK = process.env.RESET_LINK;
const transporter = nodemailer.createTransport(
  sendgridtransport({
    auth: {
      api_key: process.env.SEND_GRID_KEY,
    },
  })
);

app.use(
  session({
    secret: "something written here",
    resave: false,
    saveUninitialized: true,
  })
);

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(body.urlencoded({ extended: true }));

mongoose.connect("mongodb://localhost:27017/deliverysystem", {
  useFindAndModify: false,
  useUnifiedTopology: true,
  useNewUrlParser: true,
  useCreateIndex: true,
});

const userSchema = new mongoose.Schema({
  name: String,
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
  },
  mobile: {
    type: Number,
    length: 10,
    required: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    validate: [(input) => input.length >= 6, "Password should be longer."],
  },
  role: {
    type: Number,
    default: 0,
  },
});

const itemschema = new mongoose.Schema({
  image: String,
  title: String,
  name: String,
  description: String,
  price: Number,
});

const orderSchema = new mongoose.Schema(
  {
    itemList: [],
    customer: { type: ObjectId, required: true, ref: "usermodel" },
    status: { type: Number, required: true, min: 0, max: 4 },
  },
  { timestamps: true }
);

const deliveryOrderSchema = new mongoose.Schema({
  deliveryBoy: {
    type: ObjectId,
    required: true,
    ref: "usermodel",
  },
  order: {
    type: ObjectId,
    required: true,
    ref: "Order",
  },
});

var itemmodel = mongoose.model("itemmodel", itemschema);
var usermodel = mongoose.model("usermodel", userSchema);
const Order = mongoose.model("Order", orderSchema);
const DeliveryOrder = mongoose.model("DeliveryOrder", deliveryOrderSchema);

app.get("/reset", function (req, res) {
  res.render("resetemail");
});

app.get("/payment", function (req, res) {
  res.render("payment", {
    key: process.env.STRIPE_PUBLIC_KEY,
  });
});

app.post("/payment/:Id", isSignedIn, function (req, res) {
  const pizzalist = req.session.pizzalist;
  const numberlist = req.session.numberlist;
  const customerId = req.params.Id;
  let total = 0;
  for (let i = 0; i < pizzalist.length; i++) {
    const pizza = pizzalist[i];
    total = total + parseInt(numberlist[i]) * parseFloat(pizza.price);
  }
  stripe.customers
    .create({
      email: req.body.stripeEmail,
      source: req.body.stripeToken,
    })
    .then((customer) => {
      return stripe.charges.create({
        amount: total,
        description: "Delicious pizzas",
        currency: "INR",
        customer: customer.id,
      });
    })
    .then((charge) => {
      const order = new Order({
        itemList: pizzalist,
        customer: customerId,
        status: 2,
      });

      order
        .save()
        .then((savedOrder) => {
          req.session.pizzalist = [];
          req.session.numberlist = [];
          return res.redirect("/home");
        })
        .catch((err) => {
          console.log(err);
          console.log("ORDER ERROR");
          return res.status(400).send("ORDER WAS NOT SAVED");
        });
    })
    .catch((err) => {
      return res.send(err);
    });
});

app
  .route("/login")
  .get(function (req, res) {
    res.render("login");
  })
  .post(function (req, res) {
    usermodel.findOne({ username: req.body.username }, function (err, user) {
      if (err) {
        console.log(err);
        res.render("login");
      } else if (!user) {
        res.status(404).send("USER NOT FOUND");
      } else if (user.password == req.body.pass) {
        user.password = undefined;
        req.session.user = user;
        sessionstorage.setItem("user", user);
        req.session.pizzalist = [];
        req.session.numberlist = [];
        if (user.role == 0) {
          res.redirect("/home");
        } else if (user.role == 2) {
          res.redirect("/delivery_boy/" + user._id);
        } else if (user.role == 3) {
          res.redirect("/admin/" + user._id);
        } else {
          res.status(404).send("Not found");
        }
      } else {
        res.redirect("/login");
      }
    });
  });

app.get("/customer/ordertrack/:Id", isSignedIn, function (req, res) {
  const customerId = req.params.Id.trim();
  Order.find({ customer: customerId, status: { $lt: 4 } }).exec(
    (err, pendingOrders) => {
      if (err) {
        console.log("CUSTOMER ORDERTRACK ERROR");
        res.status(400).send("CUSTOMER ORDERTRACK ERROR");
        console.log(err);
      }
      console.log(pendingOrders);
      return res.render("ordertrack", {
        person: sessionstorage.getItem("user"),
        pendingOrders,
      });
    }
  );
});

app.get("/customer/prev_orders/:Id", isSignedIn, function (req, res) {
  const customerId = req.params.Id.trim();
  Order.find({ customer: customerId, status: 4 }, "itemList")
    .sort({ createdAt: "desc" })
    .exec((err, completedOrders) => {
      if (err) {
        console.log("CUSTOMER COMPLETED ORDER RETRIEVAL ERROR");
        res.status(400).send("CUSTOMER COMPLETED ORDER RETRIEVAL ERROR");
        console.log(err);
      }
      return res.render("prev_orders", {
        customer: sessionstorage.getItem("user"),
        completedOrders,
      });
    });
});

app.get("/register", function (req, res) {
  res.render("register");
});

app.get("/home", function (req, res) {
  if (req.session.user) {
    var person = sessionstorage.getItem("user");
    res.render("home", { person: person });
  } else {
    res.redirect("/login");
  }
});

app.get("/home/:page", (req, res) => {
  const pageName = req.params.page;
  var person = sessionstorage.getItem("user");
  res.render(pageName, {
    person: person,
  });
});

// here the id field is customer Id
app.get("/items/:itemname/:Id", isSignedIn, (req, res) => {
  var c = req.params.itemname;
  itemmodel.findOne({ title: c }, function (err, item) {
    if (err) {
      console.log("SOME INVALID ITEM NAME");
      return res.redirect("/home");
    }
    res.render("items", { item: item, customer: req.session.user });
  });
});

app.get("/logout", function (req, res) {
  req.session.destroy();
  sessionstorage.removeItem("user");
  res.redirect("/login");
});

// order related
app.get("/orders/:Id", isSignedIn, function (req, res) {
  res.render("orders", {
    pizzalist: req.session.pizzalist,
    numberlist: req.session.numberlist,
    key: process.env.STRIPE_PUBLIC_KEY,
    customer: sessionstorage.getItem("user"),
  });
});

app.get("/orders/increment/:index", function (req, res) {
  const index = parseInt(req.params.index);
  req.session.numberlist[index] += 1;
  res.json({
    msg: "success",
    newCnt: req.session.numberlist[index],
  });
});

app.get("/orders/decrement/:index", function (req, res) {
  const index = parseInt(req.params.index);
  req.session.numberlist[index] -= 1;
  req.session.numberlist[index] =
    req.session.numberlist[index] <= 0 ? 1 : req.session.numberlist[index];
  res.json({
    msg: "success",
    newCnt: req.session.numberlist[index],
  });
});

app.get("/orders/update/:index", function (req, res) {
  const index = parseInt(req.params.index);
  const newCnt = parseInt(req.query["newCnt"]);
  req.session.numberlist[index] = newCnt <= 0 || isNaN(newCnt) ? 1 : newCnt;
  res.json({
    msg: "success",
    newCnt: req.session.numberlist[index],
  });
});

app.post("/orders/remove/:index", function (req, res) {
  const index = parseInt(req.params.index);
  if (index >= 0) {
    req.session.pizzalist.splice(index, 1);
  }
  res.redirect("/orders/" + req.session.user._id);
});

app.post("/orders/:title/:Id", isSignedIn, function (req, res) {
  const title = req.params.title;
  const customerId = req.params.Id.trim();
  // check for duplications
  for (pizza of req.session.pizzalist) {
    if (pizza.title === title) {
      return res.redirect(`/orders/${customerId}`);
    }
  }
  itemmodel.findOne({ title: req.params.title }, function (err, pizza) {
    if (err) {
      return res.redirect(`/orders/${customerId}`);
    } else {
      req.session.pizzalist.push(pizza);
      req.session.numberlist.push(1);
      return res.redirect(`/orders/${customerId}`);
    }
  });
});

// assign order related
app.get("/admin/orders/:Id", isSignedIn, isAdmin, (req, res) => {
  Order.find({ status: { $gt: 0 } })
    .populate("customer")
    .exec((err, pending_orders) => {
      if (err) {
        return res.status(400).send("ACESS DENIED");
      }
      console.log(pending_orders);
      res.render("order_admin", { pending_orders });
    });
});

// delivery boy related
app.get("/delivery_boy/:Id", isSignedIn, (req, res) => {
  const Id = req.params.Id.trim();
  console.log(Id);
  const delivery_boy = sessionstorage.getItem("user");
  DeliveryOrder.find({
    deliveryBoy: Id,
  })
    .populate("deliveryBoy")
    .populate("order")
    .exec((err, deliveryOrders) => {
      if (err) {
        console.log(err);
        res.status(400).send("DELIVERY ORDER RELATED ERROR");
      }
      const pendingDeliveryOrders = deliveryOrders.filter(
        (deliveryOrder) => deliveryOrder.order.status < 4
      );
      const pendingOrders = [];
      pendingDeliveryOrders.forEach((pendingDeliveryOrder) => {
        pendingOrders.push(pendingDeliveryOrder.order);
      });
      delivery_boy.password = undefined;
      usermodel.find({ role: 0 }).exec((customerError, customers) => {
        if (customerError) {
          console.log("ERROR IN FINDING CUSTOMER");
          console.error(customerError);
          return res.status(400).send("ERROR IN FINDING CUSTOMER");
        }

        // filling customer's info that made the order
        for (let pendingOrder of pendingOrders) {
          const foundCustomer = customers.find((customer) => {
            return customer._id.equals(pendingOrder.customer);
          });
          if (foundCustomer !== undefined) {
            pendingOrder.customer = foundCustomer;
          }
        }
        res.render("delivery_boy", { pendingOrders, delivery_boy });
      });
    });
});

app.post("/delivery_boy/status/:Id", isSignedIn, (req, res) => {
  const deliveryBoyId = req.params.Id;
  const { status } = req.body;

  DeliveryOrder.find({ deliveryBoy: deliveryBoyId })
    .populate("order")
    .exec((err, deliveryOrders) => {
      if (err) {
        console.log("STATUS ERROR");
        console.log(err);
        return res.status(400).send("STATUS UPDATE FAILURE");
      }

      const pendingDeliveryOrder = deliveryOrders.find((deliveryOrder) => {
        return deliveryOrder.order.status === 3;
      });
      console.log(pendingDeliveryOrder);
      const pendingOrderId = pendingDeliveryOrder.order._id;
      Order.findByIdAndUpdate(pendingOrderId, {
        status: parseInt(status),
      }).exec((orderError, updatedOrder) => {
        if (orderError) {
          console.log("ORDER UPDATION ERROR");
          return res.status(400).send("UPDATION FAILED");
        }
        if (updatedOrder == null) {
          return res.status(500).end();
        }

        res.json({
          msg: "success",
          status: updatedOrder.status,
        });
      });
    });
});

// password reset related
app.get("/reset/:memid", function (req, res) {
  var thisid = req.params.memid;
  usermodel.findById(thisid, function (err, person) {
    if (err) {
      console.log(err);
      res.redirect("/login");
    } else {
      res.render("changepassword", { person: person });
    }
  });
});

app.post("/newpassword/:id", function (req, res) {
  usermodel.findByIdAndUpdate(
    req.params.id,
    { password: req.body.newpassword },
    function (err, person) {
      if (err) {
        console.log(err);
      } else {
        transporter
          .sendMail({
            to: person.email,
            from: "ats465151@gmail.com",
            subject: "Pizzigy - Password Reset",
            html: `
            <h2>Congrats!! Your password has been reset successfully.</h2>
            `,
          })
          .then((msg) => {
            console.log(msg);
            res.redirect("/login");
          })
          .catch((err) => {
            console.log(err);
            res.redirect("/login");
          });
      }
    }
  );
});

app.post("/reset", function (req, res) {
  var resetmail = req.body.resetemail;
  usermodel.findOne({ email: resetmail }, function (err, member) {
    console.log(RESET_LINK + member._id);
    if (err) {
      res.redirect("/register");
    } else if (!member) {
      res.redirect("/register");
    } else {
      transporter.sendMail({
        to: member.email,
        from: "ats465151@gmail.com",
        subject: "Pizzigy - Password Reset",
        html: `
            <h2>Greeting from Pizzigy!!</h2>
            <h3>Password reset link</h3><br><p>Click on this <a href="${
              RESET_LINK + member._id
            }"><u>link</u></a> for password reset.</p>
            `,
      });
      res.render("canceltab", { member: member });
    }
  });
});

// admin route
app.get("/admin/:Id", isSignedIn, isAdmin, (req, res) => {
  Order.find({
    status: 2,
  })
    .populate("customer")
    .exec((err, pending_orders) => {
      if (err) {
        console.log(err);
        return res.status(400).send("ORDER RELATED ERROR");
      }
      res.render("admin", { pending_orders });
    });
});

app.delete(
  "/admin/delivery_boy_remove/:Id",
  isSignedIn,
  isAdmin,
  (req, res) => {
    console.log("COMING DELETE REQUEST");
    const { deliveryBoyId } = req.body;
    usermodel.findByIdAndDelete(deliveryBoyId, (err, deletedDeliveryBoy) => {
      if (err) {
        console.log("DELIVERY BOY DELETION ERROR");
        console.error(err);
        return res.status(400).end();
      }
      return res.json({
        msg: "success",
      });
    });
  }
);

app.post("/pay/:Id", isSignedIn, (req, res) => {
  const pizzalist = req.session.pizzalist;
  const numberlist = req.session.numberlist;
  const customerId = req.body.customerId;
  for (let i = 0; i < pizzalist.length; i++) {
    const pizza = pizzalist[i];
    pizza.cnt = numberlist[i];
  }
  const order = new Order({
    itemList: pizzalist,
    customer: customerId,
    status: 2,
  });
  order
    .save()
    .then((savedOrder) => {
      req.session.pizzalist = [];
      req.session.numberlist = [];
      res.redirect("/home");
    })
    .catch((err) => {
      console.log(err);
      console.log("ORDER ERROR");
      return res.status(400).send("ORDER WAS NOT SAVED");
    });
});

app.post("/register", function (req, res) {
  var name = req.body.name;
  var username = req.body.username;
  var email = req.body.email;
  var mobile = req.body.mobile;
  var password = req.body.pass;
  var confirmpass = req.body.confirmpass;
  var newuser = {
    name: name,
    username: username,
    email: email,
    mobile: mobile,
    password: password,
  };
  usermodel.create(newuser, function (err, user) {
    if (err) {
      console.log(err);
    } else {
      if (confirmpass === password) {
        res.render("login");
      } else {
        console.log("The two passwords didnt match. Try Again!");
        res.render("register");
      }
    }
  });
});

app.post("/assign/:orderId/:Id", isSignedIn, isAdmin, (req, res) => {
  const orderId = req.params.orderId;
  usermodel.find({ role: 2 }).exec((err, deliveryBoys) => {
    if (err) {
      console.log(err);
      res.status(400).send("ERROR IN FINDING ALL THE DELIVERY BOYS");
    }

    DeliveryOrder.find()
      .populate("order")
      .exec((deliveryOrderError, deliveryOrders) => {
        if (deliveryOrderError) {
          console.log(deliveryOrderError);
          return res.status.send("ERROR RELATED TO DELIVERY AND ORDER");
        }
        const pendingDeliveryOrders = deliveryOrders.filter(
          (deliveryOrder) => deliveryOrder.order.status === 3
        );
        const freeDeliveryBoys = [];
        const busyDeliveryBoys = [];
        for (let i = 0; i < deliveryBoys.length; i++) {
          const deliveryBoyId = deliveryBoys[i]._id;
          if (
            isDeliveryBoyIdPresentInPendingOrders(
              deliveryBoyId,
              pendingDeliveryOrders
            )
          ) {
            busyDeliveryBoys.push(deliveryBoys[i]);
          } else {
            freeDeliveryBoys.push(deliveryBoys[i]);
          }
        }
        res.render("assign", { orderId, freeDeliveryBoys, busyDeliveryBoys });
      });
  });
});

app.post("/allocate/:Id", isSignedIn, isAdmin, (req, res) => {
  const orderId = req.body.orderId.trim();
  const deliveryBoyId = req.body.deliveryBoyId.trim();
  const adminId = req.params.Id.trim();
  Order.findByIdAndUpdate(orderId, { status: 3 }, (err, order) => {
    if (err) {
      console.log(err);
      return res.status(400).send("ORDER WAS NOT ALLOCATED");
    }
    if (!order) {
      return res.status(400).send("ORDER WAS NOT ALLOCATED");
    }
    // console.log(order);
    const deliveryOrder = new DeliveryOrder({
      deliveryBoy: deliveryBoyId,
      order: orderId,
    });
    deliveryOrder
      .save()
      .then((savedDeliveryOrder) => {
        res.redirect("/admin/" + adminId);
      })
      .catch((deliveryOrderError) => {
        console.log(deliveryOrderError);
        console.log("DELIVERY ORDER ERROR");
        res.status(400).send("SOME PROCESSING ERROR");
      });
  });
});

app.get("/admin/deliveryboys/:Id", isSignedIn, isAdmin, (req, res) => {
  const Id = req.params.Id.trim();
  usermodel.find({ role: 2 }, (err, delivery_boys) => {
    if (err) {
      return res.status(500).send("internal server error");
    }
    if (!delivery_boys && delivery_boys.length == 0) {
      return res.status(400).send("no delivery boy found");
    }
    res.render("list_delivery_boys", { Id, delivery_boys });
  });
});

app
  .route("/admin/add_delivery_boy/:Id")
  .get(isSignedIn, isAdmin, (req, res) => {
    res.render("add_delivery_boy");
  })
  .post(isSignedIn, isAdmin, (req, res) => {
    const adminId = req.params.Id.trim();
    const {
      name,
      username,
      email,
      pass: password,
      mobile,
      confirmpass,
    } = req.body;
    const newDeliveryBoy = {
      name,
      username,
      email,
      mobile,
      password,
      role: 2,
    };
    console.log(newDeliveryBoy);
    usermodel.create(newDeliveryBoy, function (err, user) {
      if (err) {
        console.error(err);
        console.log("DELIVERY BOY CREATION ERROR");
        res.redirect(`/admin/add_delivery_boy/${adminId}`);
      } else {
        if (confirmpass === password) {
          res.redirect(`/admin/${adminId}`);
        } else {
          console.log("THE TWO PASSWORDS DIDNT MATCH. TRY AGAIN!");
          res.redirect(`/admin/add_delivery_boy/${adminId}`);
        }
      }
    });
  });

function isAdmin(req, res, next) {
  usermodel.findById(req.params.Id, (err, admin) => {
    if (err) {
      return res.status(401).json({ error: "access denied" });
    } else if (!admin) {
      return res.status(400).json({ error: "No user found" });
    } else if (admin.role != 3) {
      return res.status(401).json({ error: "access denied" });
    } else {
      res.locals.admin = admin;
      next();
    }
  });
}

function isSignedIn(req, res, next) {
  const user = sessionstorage.getItem("user");
  if (!user) {
    return res.redirect("/login");
  }
  if (user._id != req.params.Id.trim()) {
    return res.redirect("/login");
  }
  next();
}

function isDeliveryBoyIdPresentInPendingOrders(
  deliveryBoyId,
  pendingDeliveryOrders
) {
  if (pendingDeliveryOrders.length == 0) {
    return false;
  }
  for (let i = 0; i < pendingDeliveryOrders.length; i++) {
    if (deliveryBoyId.equals(pendingDeliveryOrders[i].deliveryBoy._id)) {
      return true;
    }
  }
  return false;
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, "localhost", function () {
  console.log("CONNECTED TO SERVER 3040");
});
