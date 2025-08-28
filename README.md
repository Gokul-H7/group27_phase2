# Pakcage Registry
ECE 461
Simple Package Registry.

This repository hosts the code used for the lambda functions, frontend, and ratings system used in the implementation of a simple package registry.

This registry currently has a working upload, download, and query by ID/Name as well as searching by regex over package names and READMEs.

The lambda functions are hosted on AWS and routed to specific API endpoints by API Gateway. 
The API endpoint link is only available to those who are authorized to change the status of the directory.

The ratings code taken from this repository: https://github.com/lbostre/ECE461_Team
extra rating metrics are added as well.

