from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet, BayesianRidge
from sklearn.neighbors import KNeighborsRegressor
from sklearn.svm import SVR
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, AdaBoostRegressor, ExtraTreesRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
from xgboost import XGBRegressor


lst_models = [
                ("Lin_Reg", LinearRegression()),
                ("RF_Reg", RandomForestRegressor(n_estimators=100)),
                ("KN_Reg", KNeighborsRegressor()),
                ("DT_Reg", DecisionTreeRegressor()),
                ("SVM_Reg", SVR()),
                ('Ridge',Ridge(alpha=1.0)),
                # ('GB_Reg',GradientBoostingRegressor(n_estimators=100)),
                ('AB_Regressor',AdaBoostRegressor(n_estimators=50)),
                ('XGB_Reg',XGBRegressor()),
                ('BR_Reg',BayesianRidge()),
                ('ExTree_Reg',ExtraTreesRegressor(n_estimators=100))
                ## ('LGBMRegressor',lgb.LGBMRegressor()),
                # ('CatBoostRegressor', cb.CatBoostRegressor(verbose=0))
                # ('Lasso',Lasso()),
                # ('ElasticNet',ElasticNet())
                # you can add more model name
        ]
    

model_names = [model_name for model_name, _ in lst_models]