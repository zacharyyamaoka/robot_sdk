"""Two copies of one arm description mounted into one cell: names nest, CAN ids stay inside each table."""

import numpy as np
from robot_msgs.control import JointTable, Servo, ServoCommand, select

ARM = JointTable(joints={"shoulder": Servo(can_id=12), "elbow": Servo(can_id=13)})

left_arm = JointTable(bus="fdcanusb:LEFT", joints=ARM.joints).mounted("left_arm")
right_arm = JointTable(bus="pi3hat:1", joints=ARM.joints).mounted("right_arm")
cell = JointTable.combine(left_arm, right_arm)
print("cell joints:", cell.names)

command = ServoCommand(name=cell.names, position=np.radians([10, 20, 30, 40]))
right_only = select(command, "right_arm")
print("right_arm joints:", right_only.name)
print("right_arm servo keys:", cell.to_servos(right_only).name)
print("one joint:", select(command, "left_arm/elbow").name)
