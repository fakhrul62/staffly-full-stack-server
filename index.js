import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

//========================= MONGODB CONNECTION

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wwkoz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    //==============================================================
    //Get the database and collection on which to run the operation
    const userCollection = client.db("empDB").collection("users");
    const userTaskCollection = client.db("empDB").collection("tasks");
    const payrollCollection = client.db("empDB").collection("payrolls");

    //jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //verify token middleware
    const verifyToken = (req, res, next) => {
      // console.log("inside verifyToken", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized Access Brother" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res
            .status(401)
            .send({ message: "Unauthorized Access Brother" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //users api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const isExist = await userCollection.findOne(query);
      if (isExist) {
        return res.send({ message: "User already exists!", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Request Brother" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      let role = {
        admin: false,
        hr: false,
        employee: false,
      };

      if (user) {
        if (user?.role === "admin") {
          role.admin = true;
        } else if (user?.role === "hr") {
          role.hr = true;
        } else if (user?.role === "employee") {
          role.employee = true;
        }
      }

      res.send({ role });
    });
    app.get("/employees", verifyToken, async (req, res) => {
      const query = { role: "employee" };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });
    app.patch("/users/:id", verifyToken, async (req, res) => {
      const user = req.body; // Destructure the values from the request body
      const id = req.params.id; // Get the task ID from the URL parameter
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid ID format" });
      }
      const updatedDoc = {
        $set: {
          isVerified: user.isVerified,
        },
      };
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        updatedDoc
      );
      res.send(result);
    });

    //payroll api
    app.get("/payrolls/check", async (req, res) => {
      const { employee_email, month, year } = req.query;
    
      if (!employee_email || !month || !year) {
        return res.status(400).json({ message: "Missing required query parameters" });
      }
    
      const existingPayroll = await payrollCollection.findOne({ 
        employee_email, 
        month, 
        year 
      });
    
      res.json({ exists: !!existingPayroll });
    });
    app.post("/payrolls", async (req, res) => {
      const payrolls = req.body;
    
      // Check if payroll already exists
      const existingPayroll = await payrollCollection.findOne({
        employee_email: payrolls.employee_email,
        month: payrolls.month,
        year: payrolls.year,
      });
    
      if (existingPayroll) {
        return res.status(400).json({ message: "Payroll for this month already exists" });
      }
    
      const payrollsResult = await payrollCollection.insertOne(payrolls);
      res.json(payrollsResult);
    });
    app.get("/payrolls", async (req, res) => {
      // const email = req.params.email;
      // const query = { employee_email: email };
      // if (email !== req.decoded.email) {
      //   return res.status(403).send({
      //     message: "Forbidden Request Brother. Check your own payment history.",
      //   });
      // }
      const result = await payrollCollection.find().toArray();
      res.send(result);
    });

    //tasks api
    app.post("/tasks", async (req, res) => {
      const tasks = req.body;
      const tasksResult = await userTaskCollection.insertOne(tasks);
      res.send(tasksResult);
    });

    app.get("/tasks/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { user_email: email };
      if (email !== req.decoded.email) {
        return res.status(403).send({
          message: "Forbidden Request Brother. Check your own payment history.",
        });
      }
      const result = await userTaskCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/tasks/:id", verifyToken, async (req, res) => {
      const { task, hour, date } = req.body; // Destructure the values from the request body
      const taskId = req.params.id; // Get the task ID from the URL parameter
      const updatedDoc = {
        $set: {
          task: task,
          hour: hour,
          date: date,
        },
      };
      const result = await userTaskCollection.updateOne(
        { _id: new ObjectId(taskId) },
        updatedDoc
      );
      res.send(result);
    });

    app.delete("/tasks/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userTaskCollection.deleteOne(query);
      res.send(result);
    });

    //==================================================================
  } finally {
  }
}
run().catch(console.dir);

//================================================

app.get("/", (req, res) => {
  res.send("STAFFLY IS RUNNING...");
});
app.listen(port, () => {
  console.log("STAFFLY is running on port: ", port);
});
